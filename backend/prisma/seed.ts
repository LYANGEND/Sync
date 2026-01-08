import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting multi-tenant database seeding...');

  const tenantsData = [
    {
      name: 'Lyangend Early Learning Centre',
      slug: 'lyangend',
      emailPrefix: 'lyangend',
      primaryColor: '#2563eb',
    },
    {
      name: 'Prestige International School',
      slug: 'prestige',
      emailPrefix: 'prestige',
      primaryColor: '#7c3aed',
    },
  ];

  for (const tenantData of tenantsData) {
    console.log(`\n🏫 Seeding Tenant: ${tenantData.name}...`);

    // 1. Create or Update Tenant
    const tenant = await prisma.tenant.upsert({
      where: { slug: tenantData.slug },
      update: {},
      create: {
        name: tenantData.name,
        slug: tenantData.slug,
        primaryColor: tenantData.primaryColor,
        email: `info@${tenantData.slug}.edu.zm`, // Required field
      },
    });
    console.log(`   ✅ Tenant ID: ${tenant.id}`);

    // 2. Create Users (Admin, Bursar, Teacher)
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
          } as any,
        });
        console.log(`   👤 Created ${u.role}: ${u.email}`);
      } else {
        createdUsers[u.role] = existingUser;
        console.log(`   👤 ${u.role} already exists: ${u.email}`);
      }
    }

    // 3. Create Academic Term
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
      console.log('   📅 Created Term:', term.name);
    } else {
      console.log('   📅 Active Term exists:', term.name);
    }

    // 4. Create Classes
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
            teacherId: createdUsers['TEACHER'].id,
          } as any
        });
        console.log(`   📚 Created Class: ${cls.name}`);
      } else {
        console.log(`   📚 Class exists: ${cls.name}`);
      }
      createdClasses.push(c);
    }

    // 5. Create Fee Templates
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
      console.log('   💰 Created Fee Template');
    }

    // 6. Create Students
    let studentCount = 0;
    for (const cls of createdClasses) {
      if (!cls) continue;
      for (let i = 1; i <= 3; i++) {
        const admNum = `${tenantData.slug.substring(0, 3).toUpperCase()}${cls.gradeLevel}00${i}`;
        let student = await prisma.student.findFirst({ where: { admissionNumber: admNum, tenantId: tenant.id } as any });

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
              guardianName: 'Parent',
              guardianPhone: '097000000',
            } as any
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
            if (i % 2 === 0) {
              await prisma.payment.create({
                data: {
                  studentId: student.id,
                  tenantId: tenant.id,
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
    console.log(`   students seeded: ${studentCount} (newly created)`);
  }

  console.log('\n🎉 Multi-tenant seeding completed!');
  console.log('Login credentials (password: password123):');
  console.log('  Lyangend: admin@lyangend.com');
  console.log('  Prestige: admin@prestige.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
