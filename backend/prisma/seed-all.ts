
import process from 'process';
import { PrismaClient, PlatformRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ============================================================================
// CONSTANTS
// ============================================================================
const EXCHANGE_RATE = 27; // ZMW per USD (update quarterly)
const PER_STUDENT_ZMW = 20;
const PER_STUDENT_USD = Number((PER_STUDENT_ZMW / EXCHANGE_RATE).toFixed(2));

// ============================================================================
// 1. PLATFORM SETTINGS SEED
// ============================================================================
async function seedPlatformSettings() {
    console.log('\n📦 Seeding Platform Settings with Features and Tiers...');

    const defaultFeatures = [
        { key: 'attendance', label: 'Attendance Tracking' },
        { key: 'fee_management', label: 'Fee Management' },
        { key: 'report_cards', label: 'Report Cards' },
        { key: 'parent_portal', label: 'Parent Portal' },
        { key: 'email_notifications', label: 'Email Notifications' },
        { key: 'sms_notifications', label: 'SMS Notifications' },
        { key: 'online_assessments', label: 'Online Assessments' },
        { key: 'timetable', label: 'Timetable Management' },
        { key: 'syllabus_tracking', label: 'Syllabus Tracking' },
        { key: 'advanced_reports', label: 'Advanced Reports' },
        { key: 'api_access', label: 'API Access' },
        { key: 'white_label', label: 'White Label Branding' },
        { key: 'data_export', label: 'Data Export' },
        { key: 'basic_reports', label: 'Basic Reports' },
        { key: 'dedicated_support', label: 'Dedicated Support' },
        { key: 'custom_integrations', label: 'Custom Integrations' },
        { key: 'priority_support', label: 'Priority Support' },
    ];

    const defaultTiers = [
        { key: 'FREE', label: 'Free' },
        { key: 'STARTER', label: 'Starter' },
        { key: 'PROFESSIONAL', label: 'Professional' },
        { key: 'ENTERPRISE', label: 'Enterprise' },
    ];

    await prisma.platformSettings.upsert({
        where: { id: 'default' },
        update: {
            availableFeatures: defaultFeatures,
            availableTiers: defaultTiers,
        },
        create: {
            id: 'default',
            availableFeatures: defaultFeatures,
            availableTiers: defaultTiers,
        },
    });

    console.log('   ✅ Platform settings updated with features and tiers!');
}

// ============================================================================
// 2. PLATFORM ADMIN SEED
// ============================================================================
async function seedPlatformAdmin() {
    console.log('\n🚀 Seeding Platform Admin Users...');

    const defaultPassword = 'Admin@123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Create default platform superadmin
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
    console.log(`   ✅ Platform superadmin: ${superadmin.email}`);

    // Create a support user
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
    console.log(`   ✅ Platform support: ${support.email}`);

    // Create a sales user
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
    console.log(`   ✅ Platform sales: ${sales.email}`);

    console.log(`   🔑 Default password: ${defaultPassword}`);
}

// ============================================================================
// 3. SUBSCRIPTION PLANS SEED
// ============================================================================
async function seedSubscriptionPlans() {
    console.log('\n💰 Seeding Subscription Plans...');
    console.log(`   Exchange rate: K${EXCHANGE_RATE} = $1`);
    console.log(`   Per-student rate: K${PER_STUDENT_ZMW}/month (~$${PER_STUDENT_USD})`);

    // Seed Tiers first
    const tiers = [
        { name: 'Free', value: 'FREE', sortOrder: 1 },
        { name: 'Starter', value: 'STARTER', sortOrder: 2 },
        { name: 'Professional', value: 'PROFESSIONAL', sortOrder: 3 },
        { name: 'Enterprise', value: 'ENTERPRISE', sortOrder: 4 },
    ];

    for (const t of tiers) {
        await (prisma as any).subscriptionTier.upsert({
            where: { value: t.value },
            update: { name: t.name, sortOrder: t.sortOrder },
            create: { name: t.name, value: t.value, sortOrder: t.sortOrder }
        });
    }

    const plans = [
        {
            name: 'Free',
            tier: 'FREE' as any,
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
            tier: 'STARTER' as any,
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
            tier: 'PROFESSIONAL' as any,
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
                'ai_lesson_planner',
                'ai_assessments',
                'ai_report_cards',
                'crm_basic',
            ],
            isActive: true,
            isPopular: true,
            sortOrder: 2,
        },
        {
            name: 'Enterprise',
            tier: 'ENTERPRISE' as any,
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
                'ai_lesson_planner',
                'ai_assessments',
                'ai_report_cards',
                'ai_tutor',
                'ai_analytics',
                'crm_advanced',
                'teacher_ai_assistant',
            ],
            isActive: true,
            isPopular: false,
            sortOrder: 3,
        },
    ];

    for (const plan of plans) {
        const monthlyPriceUSD = Number((plan.monthlyPriceZMW / EXCHANGE_RATE).toFixed(2));
        const yearlyPriceUSD = Number((plan.yearlyPriceZMW / EXCHANGE_RATE).toFixed(2));

        const existing = await prisma.subscriptionPlan.findFirst({
            where: { tier: plan.tier },
        });

        if (existing) {
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
            console.log(`   ✅ Updated: ${plan.name}`);
        } else {
            await prisma.subscriptionPlan.create({
                data: {
                    ...plan,
                    monthlyPriceUSD,
                    yearlyPriceUSD,
                    pricePerStudentZMW: PER_STUDENT_ZMW,
                    pricePerStudentUSD: PER_STUDENT_USD,
                },
            });
            console.log(`   ✅ Created: ${plan.name}`);
        }
    }
}

// ============================================================================
// 4. MULTI-TENANT DEMO DATA SEED
// ============================================================================
async function seedMultiTenantDemoData() {
    console.log('\n🏫 Seeding Multi-Tenant Demo Data...');

    const tenantsData = [
        {
            name: 'Lyangend Early Learning Centre',
            slug: 'lyangend',
            emailPrefix: 'lyangend',
            primaryColor: '#2563eb',
            tier: 'PROFESSIONAL' as any,
        },
        {
            name: 'Prestige International School',
            slug: 'prestige',
            emailPrefix: 'prestige',
            primaryColor: '#7c3aed',
            tier: 'STARTER' as any, // Starter plan
        },
    ];

    for (const tenantData of tenantsData) {
        console.log(`\n   🏫 Seeding Tenant: ${tenantData.name}...`);

        // Get plan limits for this tier
        const plan = await prisma.subscriptionPlan.findFirst({
            where: { tier: tenantData.tier }
        });

        // 1. Create or Update Tenant with plan limits
        const tenant = await prisma.tenant.upsert({
            where: { slug: tenantData.slug },
            update: {
                tier: tenantData.tier,
                maxStudents: plan?.maxStudents || 50,
                maxTeachers: plan?.maxTeachers || 5,
                maxUsers: plan?.maxUsers || 10,
                maxClasses: plan?.maxClasses || 5,
            },
            create: {
                name: tenantData.name,
                slug: tenantData.slug,
                primaryColor: tenantData.primaryColor,
                email: `info@${tenantData.slug}.edu.zm`,
                tier: tenantData.tier,
                status: 'ACTIVE',
                maxStudents: plan?.maxStudents || 50,
                maxTeachers: plan?.maxTeachers || 5,
                maxUsers: plan?.maxUsers || 10,
                maxClasses: plan?.maxClasses || 5,
                // Enable features based on plan
                smsEnabled: plan?.features?.includes('sms_notifications') || false,
                onlineAssessmentsEnabled: plan?.features?.includes('online_assessments') || false,
                parentPortalEnabled: plan?.features?.includes('parent_portal') || false,
                advancedReportsEnabled: plan?.features?.includes('advanced_reports') || false,
                apiAccessEnabled: plan?.features?.includes('api_access') || false,
                timetableEnabled: plan?.features?.includes('timetable') || false,
                syllabusEnabled: plan?.features?.includes('syllabus_tracking') || false,
                aiLessonPlanEnabled: plan?.features?.includes('ai_lesson_planner') || false,
                aiTutorEnabled: plan?.features?.includes('ai_tutor') || false,
                aiAnalyticsEnabled: plan?.features?.includes('ai_analytics') || false,
                aiReportCardsEnabled: plan?.features?.includes('ai_report_cards') || false,
                aiAssessmentsEnabled: plan?.features?.includes('ai_assessments') || false,
            },
        });
        console.log(`      ✅ Tenant ID: ${tenant.id} (Tier: ${tenantData.tier})`);

        // 2. Create Default Branch (Main Campus)
        const branch = await prisma.branch.upsert({
            where: {
                tenantId_code: {
                    tenantId: tenant.id,
                    code: 'MAIN'
                }
            },
            update: {},
            create: {
                name: 'Main Campus',
                code: 'MAIN',
                tenantId: tenant.id,
                isMain: true,
                address: '123 Education Lane',
                status: 'ACTIVE',
                capacity: 500
            }
        });
        console.log(`      🏢 Branch: ${branch.name}`);

        // 3. Create Users (Admin, Bursar, Teacher)
        const users = [
            { role: 'SUPER_ADMIN', name: 'Super Admin', email: `admin@${tenantData.slug}.com` },
            { role: 'BURSAR', name: 'Bursar', email: `bursar@${tenantData.slug}.com` },
            { role: 'TEACHER', name: 'Teacher', email: `teacher@${tenantData.slug}.com` },
        ];

        const createdUsers: Record<string, any> = {};

        for (const u of users) {
            const existingUser = await prisma.user.findFirst({ where: { email: u.email } });
            if (!existingUser) {
                const hashedPassword = await bcrypt.hash('password123', 10);
                createdUsers[u.role] = await prisma.user.create({
                    data: {
                        email: u.email,
                        passwordHash: hashedPassword,
                        fullName: u.name,
                        role: u.role as any,
                        tenantId: tenant.id,
                        branchId: branch.id,
                    } as any,
                });

                await prisma.userBranch.create({
                    data: {
                        userId: createdUsers[u.role].id,
                        branchId: branch.id,
                        isPrimary: true,
                        role: u.role
                    }
                });

                console.log(`      👤 Created ${u.role}: ${u.email}`);
            } else {
                createdUsers[u.role] = existingUser;
            }
        }

        // 4. Create Academic Term
        let term = await prisma.academicTerm.findFirst({
            where: { isActive: true, tenantId: tenant.id } as any,
        });
        if (!term) {
            term = await prisma.academicTerm.create({
                data: {
                    name: `Term 1 ${new Date().getFullYear()}`,
                    startDate: new Date(),
                    endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
                    isActive: true,
                    tenantId: tenant.id,
                } as any,
            });
            console.log(`      📅 Created Term: ${term.name}`);
        }

        // 5. Create Classes
        const classesList = [
            { name: 'Grade 1A', level: 1 },
            { name: 'Grade 2B', level: 2 },
            { name: 'Grade 3C', level: 3 },
        ];

        const createdClasses = [];
        for (const cls of classesList) {
            let c = await prisma.class.findFirst({
                where: { name: cls.name, tenantId: tenant.id } as any
            });

            if (!c) {
                c = await prisma.class.create({
                    data: {
                        name: cls.name,
                        gradeLevel: cls.level,
                        tenantId: tenant.id,
                        academicTermId: term.id,
                        teacherId: createdUsers['TEACHER']?.id,
                        branchId: branch.id
                    } as any
                });
                console.log(`      📚 Created Class: ${cls.name}`);
            }
            createdClasses.push(c);
        }

        // 6. Create Fee Templates
        const feeTemplateName = 'Tuition Fee';
        let feeTemplate = await prisma.feeTemplate.findFirst({
            where: { name: feeTemplateName, tenantId: tenant.id } as any
        });
        if (!feeTemplate) {
            feeTemplate = await prisma.feeTemplate.create({
                data: {
                    name: feeTemplateName,
                    amount: 1500,
                    academicTermId: term.id,
                    tenantId: tenant.id,
                    applicableGrade: 1
                } as any
            });
            console.log(`      💰 Created Fee Template`);
        }

        // 7. Create Students with Parents
        let studentCount = 0;
        for (const cls of createdClasses) {
            if (!cls) continue;
            for (let i = 1; i <= 3; i++) {
                const admNum = `${tenantData.slug.substring(0, 3).toUpperCase()}${cls.gradeLevel}00${i}`;
                let student = await prisma.student.findFirst({
                    where: { admissionNumber: admNum, tenantId: tenant.id } as any
                });

                // Ensure Parent Exists
                const parentEmail = `parent.${admNum.toLowerCase()}@${tenantData.slug}.com`;
                let parentId;
                const existingParent = await prisma.user.findFirst({ where: { email: parentEmail } });

                if (!existingParent) {
                    const parentUser = await prisma.user.create({
                        data: {
                            email: parentEmail,
                            passwordHash: await bcrypt.hash('password123', 10),
                            fullName: `Parent of ${admNum}`,
                            role: 'PARENT',
                            tenantId: tenant.id,
                            isActive: true
                        } as any
                    });
                    parentId = parentUser.id;
                } else {
                    parentId = existingParent.id;
                }

                if (student && !student.parentId) {
                    await prisma.student.update({
                        where: { id: student.id },
                        data: { parentId, guardianEmail: parentEmail }
                    });
                }

                if (!student) {
                    student = await prisma.student.create({
                        data: {
                            firstName: `Student${i}`,
                            lastName: `Of${cls.name}`,
                            admissionNumber: admNum,
                            classId: cls.id,
                            tenantId: tenant.id,
                            status: 'ACTIVE',
                            dateOfBirth: new Date('2015-01-01'),
                            gender: 'MALE' as any,
                            guardianName: `Parent of ${admNum}`,
                            guardianPhone: '097000000',
                            guardianEmail: parentEmail,
                            parentId: parentId,
                            branchId: branch.id
                        } as any
                    });

                    await prisma.studentBranch.create({
                        data: {
                            studentId: student.id,
                            branchId: branch.id,
                            isPrimary: true,
                            enrollType: 'FULL_TIME'
                        }
                    });

                    // Add Fee Structure
                    if (feeTemplate) {
                        await prisma.studentFeeStructure.create({
                            data: {
                                studentId: student.id,
                                feeTemplateId: feeTemplate.id,
                                amountDue: feeTemplate.amount,
                                amountPaid: i % 2 === 0 ? feeTemplate.amount : 0,
                                dueDate: new Date()
                            } as any
                        });

                        // Add Payment if paid
                        if (i % 2 === 0 && createdUsers['BURSAR']) {
                            await prisma.payment.create({
                                data: {
                                    studentId: student.id,
                                    tenantId: tenant.id,
                                    branchId: branch.id,
                                    amount: feeTemplate.amount,
                                    method: 'CASH' as any,
                                    recordedByUserId: createdUsers['BURSAR'].id,
                                    paymentDate: new Date()
                                } as any
                            });
                        }
                    }
                    studentCount++;
                }
            }
        }
        console.log(`      👨‍🎓 Students seeded: ${studentCount}`);
    }
}

// ============================================================================
// 5. PAYMENT TEST DATA SEED
// ============================================================================
async function seedPaymentTestData() {
    console.log('\n💳 Seeding Payment Test Data...');

    const tenantSlug = 'payment-test-school';
    let tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });

    if (!tenant) {
        tenant = await prisma.tenant.create({
            data: {
                name: 'Payment Test School',
                slug: tenantSlug,
                email: 'admin@paymenttest.com',
                primaryColor: '#2563eb',
                secondaryColor: '#475569',
                status: 'ACTIVE',
            },
        });
        console.log(`   ✅ Created Tenant: ${tenant.name}`);
    }

    // Create Parent User (The Payer)
    const parentEmail = 'parent@test.com';
    const hashedPassword = await bcrypt.hash('password123', 10);

    let parent = await prisma.user.findFirst({
        where: { tenantId: tenant.id, email: parentEmail }
    });

    if (!parent) {
        parent = await prisma.user.create({
            data: {
                tenantId: tenant.id,
                email: parentEmail,
                fullName: 'Test Parent',
                passwordHash: hashedPassword,
                role: 'PARENT',
                isActive: true,
            }
        });
        console.log(`   ✅ Created Parent: ${parent.email}`);
    }

    // Create Admin
    const adminEmail = 'admin@test.com';
    let admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: adminEmail } });

    if (!admin) {
        admin = await prisma.user.create({
            data: {
                tenantId: tenant.id,
                email: adminEmail,
                fullName: 'School Admin',
                passwordHash: hashedPassword,
                role: 'SUPER_ADMIN',
                isActive: true,
            }
        });
        console.log(`   ✅ Created Admin: ${admin.email}`);
    }

    // Create Academic Term
    let term = await prisma.academicTerm.findFirst({ where: { tenantId: tenant.id } });
    if (!term) {
        term = await prisma.academicTerm.create({
            data: {
                tenantId: tenant.id,
                name: 'Term 1 2026',
                startDate: new Date(),
                endDate: new Date(new Date().setMonth(new Date().getMonth() + 3)),
                isActive: true
            }
        });
    }

    // Create Class
    let grade1 = await prisma.class.findFirst({ where: { tenantId: tenant.id, name: 'Grade 1A' } });
    if (!grade1) {
        grade1 = await prisma.class.create({
            data: {
                tenantId: tenant.id,
                name: 'Grade 1A',
                gradeLevel: 1,
                teacherId: admin.id,
                academicTermId: term.id
            }
        });
    }

    // Create Student
    const studentAdm = 'ST-2026-001';
    let student = await prisma.student.findUnique({
        where: {
            tenantId_admissionNumber: {
                tenantId: tenant.id,
                admissionNumber: studentAdm
            }
        }
    });

    if (!student) {
        student = await prisma.student.create({
            data: {
                tenantId: tenant.id,
                firstName: 'Junior',
                lastName: 'Test',
                admissionNumber: studentAdm,
                dateOfBirth: new Date('2018-01-01'),
                gender: 'MALE',
                classId: grade1.id,
                parentId: parent.id,
                guardianName: 'Test Parent',
                guardianEmail: parentEmail,
                guardianPhone: '260779993730',
                address: 'Lusaka, Zambia'
            }
        });
        console.log(`   ✅ Created Student: ${student.firstName} ${student.lastName}`);
    }
}

// ============================================================================
// 6. SAMPLE PARENT SEED
// ============================================================================
async function seedSampleParent() {
    console.log('\n👪 Seeding Sample Parent...');

    const email = 'peter.mwamba@email.com';
    const guardianName = 'Peter Mwamba';

    let parentUser = await prisma.user.findFirst({ where: { email } });

    if (!parentUser) {
        // Find any tenant to associate with
        const anyTenant = await prisma.tenant.findFirst();
        if (!anyTenant) {
            console.log('   ⚠️ No tenant found, skipping sample parent');
            return;
        }
        const hashedPassword = await bcrypt.hash('parent123', 10);
        parentUser = await prisma.user.create({
            data: {
                email,
                passwordHash: hashedPassword,
                fullName: guardianName,
                role: 'PARENT',
                tenantId: anyTenant.id,
            } as any
        });
        console.log(`   ✅ Created parent user: ${email}`);
        console.log(`   🔑 Credentials: ${email} / parent123`);
    }

    // Link to Student
    const student = await prisma.student.findFirst({
        where: { guardianEmail: email }
    });

    if (student) {
        await prisma.student.update({
            where: { id: student.id },
            data: { parentId: parentUser.id }
        });
        console.log(`   ✅ Linked parent to student: ${student.firstName} ${student.lastName}`);
    }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================
async function main() {
    console.log('🌱 ═══════════════════════════════════════════════════════════');
    console.log('   SYNC PLATFORM - COMPLETE DATABASE SEED');
    console.log('   ═══════════════════════════════════════════════════════════');

    try {
        // 1. Platform Settings (Features & Tiers)
        await seedPlatformSettings();

        // 2. Platform Admin Users
        await seedPlatformAdmin();

        // 3. Subscription Plans
        await seedSubscriptionPlans();

        // 4. Multi-Tenant Demo Data
        await seedMultiTenantDemoData();

        // 5. Payment Test Data
        await seedPaymentTestData();

        // 6. Sample Parent
        await seedSampleParent();

        console.log('\n🎉 ═══════════════════════════════════════════════════════════');
        console.log('   SEEDING COMPLETED SUCCESSFULLY!');
        console.log('   ═══════════════════════════════════════════════════════════');
        console.log('\n📝 Login Credentials:');
        console.log('   ─────────────────────────────────────────────────────────');
        console.log('   Platform Admin:');
        console.log('     • admin@sync.com / Admin@123');
        console.log('     • support@sync.com / Admin@123');
        console.log('     • sales@sync.com / Admin@123');
        console.log('   ─────────────────────────────────────────────────────────');
        console.log('   Lyangend School:');
        console.log('     • admin@lyangend.com / password123');
        console.log('     • bursar@lyangend.com / password123');
        console.log('     • teacher@lyangend.com / password123');
        console.log('   ─────────────────────────────────────────────────────────');
        console.log('   Prestige School:');
        console.log('     • admin@prestige.com / password123');
        console.log('     • bursar@prestige.com / password123');
        console.log('     • teacher@prestige.com / password123');
        console.log('   ─────────────────────────────────────────────────────────');
        console.log('   Test Users:');
        console.log('     • parent@test.com / password123');
        console.log('     • admin@test.com / password123');
        console.log('     • peter.mwamba@email.com / parent123');
        console.log('   ─────────────────────────────────────────────────────────');
    } catch (error) {
        console.error('❌ Seeding failed:', error);
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
