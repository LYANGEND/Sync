import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create Main Branch
  let mainBranch = await prisma.branch.findUnique({
    where: { code: 'MAIN' }
  });

  if (!mainBranch) {
    mainBranch = await prisma.branch.create({
      data: {
        name: 'Main Campus',
        code: 'MAIN',
        address: '123 Education Road, Lusaka, Zambia',
        isMain: true,
      }
    });
    console.log('✅ Created Main Branch');
  } else {
    console.log('✅ Main Branch already exists');
  }

  // Check if super admin already exists
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' }
  });

  let superAdmin;
  if (!existingAdmin) {
    // Create super admin
    const hashedPassword = await bcrypt.hash('admin123', 10);

    superAdmin = await prisma.user.create({
      data: {
        email: 'admin@sync.com',
        passwordHash: hashedPassword,
        fullName: 'Super Admin',
        role: 'SUPER_ADMIN',
        branchId: mainBranch.id,
      }
    });

    console.log('✅ Created super admin:', superAdmin.email);
  } else {
    superAdmin = existingAdmin;
    console.log('✅ Super admin already exists');
  }

  // Create Bursar user
  let bursar = await prisma.user.findFirst({
    where: { email: 'bursar@sync.com' }
  });

  if (!bursar) {
    const hashedPassword = await bcrypt.hash('bursar123', 10);
    bursar = await prisma.user.create({
      data: {
        email: 'bursar@sync.com',
        passwordHash: hashedPassword,
        fullName: 'Sarah Mulenga',
        role: 'BURSAR',
        branchId: mainBranch.id,
      }
    });
    console.log('✅ Created bursar:', bursar.fullName);
  } else {
    console.log('✅ Bursar already exists');
  }

  // Create or get teacher Robbie Tembo
  let teacher = await prisma.user.findFirst({
    where: { email: 'robbie.tembo@sync.com' }
  });

  if (!teacher) {
    const hashedPassword = await bcrypt.hash('teacher123', 10);
    teacher = await prisma.user.create({
      data: {
        email: 'robbie.tembo@sync.com',
        passwordHash: hashedPassword,
        fullName: 'Robbie Tembo',
        role: 'TEACHER',
        branchId: mainBranch.id,
      }
    });
    console.log('✅ Created teacher:', teacher.fullName);
  } else {
    console.log('✅ Teacher Robbie Tembo already exists');
  }

  // Create default academic term if none exists
  let currentTerm = await prisma.academicTerm.findFirst({
    where: { isActive: true }
  });

  if (!currentTerm) {
    const currentYear = new Date().getFullYear();
    currentTerm = await prisma.academicTerm.create({
      data: {
        name: `Term 1 ${currentYear}`,
        startDate: new Date(`${currentYear}-01-15`),
        endDate: new Date(`${currentYear}-04-15`),
        isActive: true,
      }
    });
    console.log('✅ Created default academic term:', currentTerm.name);
  } else {
    console.log('✅ Academic term already exists:', currentTerm.name);
  }

  // Define classes to create
  const classesToCreate = [
    { name: 'Baby Class', gradeLevel: -2 },
    { name: 'Middle Class', gradeLevel: -1 },
    { name: 'Day Care', gradeLevel: 0 },
    { name: 'Reception Class', gradeLevel: 0 },
    { name: 'Grade One', gradeLevel: 1 },
    { name: 'Grade Two', gradeLevel: 2 },
    { name: 'Grade Three', gradeLevel: 3 },
    { name: 'Grade Four', gradeLevel: 4 },
    { name: 'Grade Five', gradeLevel: 5 },
    { name: 'Grade Six', gradeLevel: 6 },
    { name: 'Grade Seven', gradeLevel: 7 },
  ];

  // Create classes if they don't exist
  const createdClasses: any[] = [];
  for (const classData of classesToCreate) {
    let existingClass = await prisma.class.findFirst({
      where: {
        name: classData.name,
        academicTermId: currentTerm.id,
      }
    });

    if (!existingClass) {
      existingClass = await prisma.class.create({
        data: {
          name: classData.name,
          gradeLevel: classData.gradeLevel,
          teacherId: teacher.id,
          academicTermId: currentTerm.id,
          branchId: mainBranch.id,
        }
      });
      console.log(`✅ Created class: ${classData.name} (Grade Level: ${classData.gradeLevel})`);
    } else {
      console.log(`✅ Class already exists: ${classData.name}`);
    }
    createdClasses.push(existingClass);
  }

  // Create Subjects
  console.log('\n📚 Seeding subjects...');
  const subjectsData = [
    { name: 'Mathematics', code: 'MATH' },
    { name: 'English Language', code: 'ENG' },
    { name: 'Science', code: 'SCI' },
    { name: 'Social Studies', code: 'SST' },
    { name: 'Creative Arts', code: 'CA' },
    { name: 'Physical Education', code: 'PE' },
    { name: 'Computer Studies', code: 'COMP' },
  ];

  const createdSubjects: any[] = [];
  for (const s of subjectsData) {
    let subject = await prisma.subject.findUnique({ where: { code: s.code } });
    if (!subject) {
      subject = await prisma.subject.create({
        data: {
          name: s.name,
          code: s.code,
          teacherId: teacher.id, // Assign default teacher
        }
      });
      console.log(`✅ Created subject: ${s.name}`);
    } else {
      console.log(`✅ Subject already exists: ${s.name}`);
    }
    createdSubjects.push(subject);
  }

  // Assign Subjects to Classes (All subjects to all Grade 1+ classes)
  console.log('  Linking subjects to classes...');
  const gradeClasses = createdClasses.filter(c => c.gradeLevel >= 1);
  for (const cls of gradeClasses) {
    // Check if class already has subjects
    const classWithSubjects = await prisma.class.findUnique({
      where: { id: cls.id },
      include: { subjects: true }
    });

    if (classWithSubjects && classWithSubjects.subjects.length === 0) {
      await prisma.class.update({
        where: { id: cls.id },
        data: {
          subjects: {
            connect: createdSubjects.map(s => ({ id: s.id }))
          }
        }
      });
      console.log(`  Linked ${createdSubjects.length} subjects to ${cls.name}`);
    }
  }

  // ========================================
  // FINANCE SEED DATA
  // ========================================
  console.log('\n💰 Seeding finance data...');

  // Create School Settings with notification preferences
  let settings = await prisma.schoolSettings.findFirst();
  if (!settings) {
    settings = await prisma.schoolSettings.create({
      data: {
        schoolName: 'Lyangend Early Learning Centre',
        schoolAddress: '123 Education Road, Lusaka, Zambia',
        schoolPhone: '+260 977 123456',
        schoolEmail: 'info@lyangend.edu.zm',
        primaryColor: '#2563eb',
        secondaryColor: '#475569',
        accentColor: '#f59e0b',
        emailNotificationsEnabled: true,
        smsNotificationsEnabled: false,
        feeReminderEnabled: true,
        feeReminderDaysBefore: 7,
        overdueReminderEnabled: true,
        overdueReminderFrequency: 7,
        currentTermId: currentTerm.id,
      }
    });
    console.log('✅ Created school settings');
  } else {
    // Update existing settings with notification preferences if not set
    settings = await prisma.schoolSettings.update({
      where: { id: settings.id },
      data: {
        emailNotificationsEnabled: settings.emailNotificationsEnabled ?? true,
        smsNotificationsEnabled: settings.smsNotificationsEnabled ?? false,
        feeReminderEnabled: settings.feeReminderEnabled ?? true,
        feeReminderDaysBefore: settings.feeReminderDaysBefore ?? 7,
        overdueReminderEnabled: settings.overdueReminderEnabled ?? true,
        overdueReminderFrequency: settings.overdueReminderFrequency ?? 7,
      }
    });
    console.log('✅ Updated school settings');
  }

  // Create Fee Templates
  const feeTemplatesData = [
    { name: 'Tuition Fee - Baby Class', amount: 2500, applicableGrade: -2 },
    { name: 'Tuition Fee - Middle Class', amount: 2800, applicableGrade: -1 },
    { name: 'Tuition Fee - Reception', amount: 3000, applicableGrade: 0 },
    { name: 'Tuition Fee - Grade 1-3', amount: 3500, applicableGrade: 1 },
    { name: 'Tuition Fee - Grade 4-5', amount: 4000, applicableGrade: 4 },
    { name: 'Tuition Fee - Grade 6-7', amount: 4500, applicableGrade: 6 },
  ];

  const createdFeeTemplates: any[] = [];
  for (const feeData of feeTemplatesData) {
    let existingFee = await prisma.feeTemplate.findFirst({
      where: {
        name: feeData.name,
        academicTermId: currentTerm.id,
      }
    });

    if (!existingFee) {
      existingFee = await prisma.feeTemplate.create({
        data: {
          name: feeData.name,
          amount: feeData.amount,
          applicableGrade: feeData.applicableGrade,
          academicTermId: currentTerm.id,
        }
      });
      console.log(`✅ Created fee template: ${feeData.name} - ZMW ${feeData.amount}`);
    }
    createdFeeTemplates.push(existingFee);
  }

  // Create Sample Students with varying fee statuses
  const studentsData = [
    // Students with FULL payment
    { firstName: 'John', lastName: 'Mwamba', admissionNumber: 'STU2024001', gender: 'MALE', classIdx: 4, guardianName: 'Peter Mwamba', guardianPhone: '+260971111111', guardianEmail: 'peter.mwamba@email.com', feeStatus: 'PAID' },
    { firstName: 'Grace', lastName: 'Tembo', admissionNumber: 'STU2024002', gender: 'FEMALE', classIdx: 4, guardianName: 'Mary Tembo', guardianPhone: '+260972222222', guardianEmail: 'mary.tembo@email.com', feeStatus: 'PAID' },

    // Students with PARTIAL payment (debtors)
    { firstName: 'David', lastName: 'Banda', admissionNumber: 'STU2024003', gender: 'MALE', classIdx: 5, guardianName: 'James Banda', guardianPhone: '+260973333333', guardianEmail: 'james.banda@email.com', feeStatus: 'PARTIAL', paidAmount: 2000, dueDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) }, // 15 days overdue
    { firstName: 'Sarah', lastName: 'Phiri', admissionNumber: 'STU2024004', gender: 'FEMALE', classIdx: 6, guardianName: 'Joseph Phiri', guardianPhone: '+260974444444', guardianEmail: 'joseph.phiri@email.com', feeStatus: 'PARTIAL', paidAmount: 3000, dueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // 7 days overdue
    { firstName: 'Michael', lastName: 'Mulenga', admissionNumber: 'STU2024005', gender: 'MALE', classIdx: 7, guardianName: 'Alice Mulenga', guardianPhone: '+260975555555', guardianEmail: 'alice.mulenga@email.com', feeStatus: 'PARTIAL', paidAmount: 1500, dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) }, // 5 days until due

    // Students with NO payment (debtors)
    { firstName: 'Chisomo', lastName: 'Zimba', admissionNumber: 'STU2024006', gender: 'MALE', classIdx: 8, guardianName: 'Daniel Zimba', guardianPhone: '+260976666666', guardianEmail: 'daniel.zimba@email.com', feeStatus: 'PENDING', paidAmount: 0, dueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // 30 days overdue
    { firstName: 'Natasha', lastName: 'Chanda', admissionNumber: 'STU2024007', gender: 'FEMALE', classIdx: 9, guardianName: 'Elizabeth Chanda', guardianPhone: '+260977777777', guardianEmail: 'elizabeth.chanda@email.com', feeStatus: 'PENDING', paidAmount: 0, dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }, // 3 days overdue
    { firstName: 'Emmanuel', lastName: 'Sakala', admissionNumber: 'STU2024008', gender: 'MALE', classIdx: 10, guardianName: 'Ruth Sakala', guardianPhone: '+260978888888', guardianEmail: 'ruth.sakala@email.com', feeStatus: 'PENDING', paidAmount: 0, dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) }, // 10 days until due

    // More paid students
    { firstName: 'Ruth', lastName: 'Lungu', admissionNumber: 'STU2024009', gender: 'FEMALE', classIdx: 4, guardianName: 'Paul Lungu', guardianPhone: '+260979999999', guardianEmail: 'paul.lungu@email.com', feeStatus: 'PAID' },
    { firstName: 'Moses', lastName: 'Mutale', admissionNumber: 'STU2024010', gender: 'MALE', classIdx: 5, guardianName: 'Agnes Mutale', guardianPhone: '+260970000000', guardianEmail: 'agnes.mutale@email.com', feeStatus: 'PAID' },
  ];

  for (const studentData of studentsData) {
    // Check if student exists
    let student = await prisma.student.findFirst({
      where: { admissionNumber: studentData.admissionNumber }
    });

    const classForStudent = createdClasses[studentData.classIdx];

    if (!student) {
      student = await prisma.student.create({
        data: {
          firstName: studentData.firstName,
          lastName: studentData.lastName,
          admissionNumber: studentData.admissionNumber,
          dateOfBirth: new Date('2015-06-15'),
          gender: studentData.gender as any,
          guardianName: studentData.guardianName,
          guardianPhone: studentData.guardianPhone,
          guardianEmail: studentData.guardianEmail,
          classId: classForStudent.id,
          status: 'ACTIVE',
          branchId: mainBranch.id,
        }
      });
      console.log(`✅ Created student: ${studentData.firstName} ${studentData.lastName}`);

      // Get applicable fee template based on grade level
      const feeTemplate = createdFeeTemplates.find(ft => ft.applicableGrade === classForStudent.gradeLevel)
        || createdFeeTemplates.find(ft => ft.applicableGrade <= classForStudent.gradeLevel);

      if (feeTemplate) {
        // Create student fee structure
        await prisma.studentFeeStructure.create({
          data: {
            studentId: student.id,
            feeTemplateId: feeTemplate.id,
            amountDue: feeTemplate.amount,
            amountPaid: studentData.paidAmount ?? (studentData.feeStatus === 'PAID' ? feeTemplate.amount : 0),
            dueDate: studentData.dueDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          }
        });

        // Create payment records for students who have paid
        if (studentData.feeStatus === 'PAID' || (studentData.paidAmount && studentData.paidAmount > 0)) {
          const paymentAmount = studentData.feeStatus === 'PAID' ? feeTemplate.amount : studentData.paidAmount;
          await prisma.payment.create({
            data: {
              studentId: student.id,
              amount: paymentAmount,
              paymentDate: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000), // Random date in last 30 days
              method: ['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT'][Math.floor(Math.random() * 3)] as any,
              transactionId: `TXN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
              recordedByUserId: bursar.id,
              branchId: mainBranch.id,
            }
          });
          console.log(`  💳 Created payment of ZMW ${paymentAmount} for ${studentData.firstName}`);
        }
      }
    } else {
      console.log(`✅ Student already exists: ${studentData.firstName} ${studentData.lastName}`);
    }

    // Create Parent User Account and Link
    if (studentData.guardianEmail) {
      const parentPassword = await bcrypt.hash('parent123', 10);
      const parentUser = await prisma.user.upsert({
        where: { email: studentData.guardianEmail },
        update: {},
        create: {
          email: studentData.guardianEmail,
          passwordHash: parentPassword,
          fullName: studentData.guardianName || 'Parent',
          role: 'PARENT',
          branchId: mainBranch.id,
        }
      });

      // Link student to parent if not already linked
      if (student.parentId !== parentUser.id) {
        await prisma.student.update({
          where: { id: student.id },
          data: { parentId: parentUser.id }
        });
        console.log(`  👨‍👩‍👧 Linked ${student.firstName} to parent ${parentUser.fullName}`);
      }
    }
  }

  // Create some additional payment history
  console.log('\n📝 Creating sample payment history...');

  const existingStudents = await prisma.student.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });

  for (const student of existingStudents) {
    const existingPayments = await prisma.payment.count({
      where: { studentId: student.id }
    });

    // Add some historical payments if student doesn't have many
    if (existingPayments < 2) {
      const randomAmount = Math.floor(Math.random() * 2000) + 500;
      await prisma.payment.create({
        data: {
          studentId: student.id,
          amount: randomAmount,
          paymentDate: new Date(Date.now() - Math.floor(Math.random() * 60) * 24 * 60 * 60 * 1000),
          method: 'CASH',
          transactionId: `TXN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          recordedByUserId: bursar.id,
          branchId: mainBranch.id,
        }
      });
    }
  }

  console.log('\n🎉 Database seeding completed!');
  console.log('\n📊 Summary:');
  console.log('  - Students with FULL payment: 4');
  console.log('  - Students with PARTIAL payment (Debtors): 3');
  console.log('  - Students with NO payment (Debtors): 3');
  console.log('  - Fee templates created: 6');
  console.log('\n🔑 Login Credentials:');
  console.log('  - Admin: admin@sync.com / admin123');
  console.log('  - Bursar: bursar@sync.com / bursar123');
  console.log('  - Teacher: robbie.tembo@sync.com / teacher123');
  console.log('  - Parent: (Use any guardian email from above) e.g., peter.mwamba@email.com / parent123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
