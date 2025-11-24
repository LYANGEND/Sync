import { PrismaClient, Role, Gender, PaymentMethod, AttendanceStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Create System Owner (No School)
  const systemOwnerEmail = 'owner@system.com';
  let systemOwner = await prisma.user.findFirst({
    where: { 
      email: systemOwnerEmail,
      schoolId: null
    }
  });

  if (!systemOwner) {
    systemOwner = await prisma.user.create({
      data: {
        email: systemOwnerEmail,
        fullName: 'System Owner',
        role: Role.SYSTEM_OWNER,
        passwordHash,
        schoolId: null,
      },
    });
  }
  console.log('System Owner created.');

  // 2. Create Demo School
  const demoSchool = await prisma.school.upsert({
    where: { slug: 'demo-school' },
    update: {},
    create: {
      name: 'Demo High School',
      slug: 'demo-school',
      address: '123 Education Lane, Lusaka',
      phone: '0977123456',
      email: 'info@demoschool.com',
      isActive: true,
    },
  });
  console.log('Demo School created.');

  // 3. Create School Users
  const upsertSchoolUser = async (email: string, fullName: string, role: Role) => {
    return prisma.user.upsert({
      where: {
        email_schoolId: {
          email,
          schoolId: demoSchool.id
        }
      },
      update: {},
      create: {
        email,
        fullName,
        role,
        passwordHash,
        schoolId: demoSchool.id,
      },
    });
  };

  const admin = await upsertSchoolUser('admin@demoschool.com', 'Super Admin', Role.SUPER_ADMIN);
  const teacher = await upsertSchoolUser('teacher@demoschool.com', 'John Teacher', Role.TEACHER);
  const bursar = await upsertSchoolUser('bursar@demoschool.com', 'Jane Bursar', Role.BURSAR);
  const parent = await upsertSchoolUser('parent@demoschool.com', 'Mr. Banda', Role.PARENT);

  console.log('School Users created.');

  // 4. Create Academic Term
  let term = await prisma.academicTerm.findFirst({
    where: {
      schoolId: demoSchool.id,
      name: 'Term 1 2025'
    }
  });

  if (!term) {
    term = await prisma.academicTerm.create({
      data: {
        schoolId: demoSchool.id,
        name: 'Term 1 2025',
        startDate: new Date('2025-01-13'),
        endDate: new Date('2025-04-11'),
        isActive: true,
      },
    });
  }
  console.log('Academic Term created.');

  // 5. Create Class
  let grade10A = await prisma.class.findFirst({
    where: {
      schoolId: demoSchool.id,
      name: 'Grade 10 A'
    }
  });

  if (!grade10A) {
    grade10A = await prisma.class.create({
      data: {
        schoolId: demoSchool.id,
        name: 'Grade 10 A',
        gradeLevel: 10,
        teacherId: teacher.id,
        academicTermId: term.id,
      },
    });
  }
  console.log('Class created.');

  // 6. Create Students
  const studentsData = [
    { firstName: 'Alice', lastName: 'Banda', gender: Gender.FEMALE, admissionNumber: '2025001' },
    { firstName: 'Brian', lastName: 'Phiri', gender: Gender.MALE, admissionNumber: '2025002' },
    { firstName: 'Catherine', lastName: 'Zulu', gender: Gender.FEMALE, admissionNumber: '2025003' },
    { firstName: 'David', lastName: 'Lungu', gender: Gender.MALE, admissionNumber: '2025004' },
    { firstName: 'Esther', lastName: 'Mwape', gender: Gender.FEMALE, admissionNumber: '2025005' },
  ];

  const students = [];
  for (const s of studentsData) {
    const student = await prisma.student.upsert({
      where: {
        admissionNumber_schoolId: {
          admissionNumber: s.admissionNumber,
          schoolId: demoSchool.id
        }
      },
      update: {},
      create: {
        schoolId: demoSchool.id,
        firstName: s.firstName,
        lastName: s.lastName,
        admissionNumber: s.admissionNumber,
        dateOfBirth: new Date('2008-01-01'),
        gender: s.gender,
        guardianName: 'Parent ' + s.lastName,
        guardianPhone: '0977000000',
        classId: grade10A.id,
        parentId: s.lastName === 'Banda' ? parent.id : undefined,
      },
    });
    students.push(student);
  }

  console.log('Students created.');

  // 7. Create Payments
  const existingPayments = await prisma.payment.count({
      where: { studentId: students[0].id }
  });

  if (existingPayments === 0) {
      await prisma.payment.create({
        data: {
          studentId: students[0].id,
          amount: 1500.00,
          method: PaymentMethod.CASH,
          recordedByUserId: bursar.id,
          referenceNumber: 'REC001',
        },
      });

      await prisma.payment.create({
        data: {
          studentId: students[1].id,
          amount: 2000.00,
          method: PaymentMethod.MOBILE_MONEY,
          recordedByUserId: bursar.id,
          referenceNumber: 'MM123456',
        },
      });
      console.log('Payments created.');
  }

  // 8. Create Attendance
  const existingAttendance = await prisma.attendance.count({
      where: { studentId: students[0].id }
  });

  if (existingAttendance === 0) {
      await prisma.attendance.create({
        data: {
          studentId: students[0].id,
          classId: grade10A.id,
          date: new Date(),
          status: AttendanceStatus.PRESENT,
          recordedByUserId: teacher.id,
        },
      });

      await prisma.attendance.create({
        data: {
          studentId: students[1].id,
          classId: grade10A.id,
          date: new Date(),
          status: AttendanceStatus.ABSENT,
          recordedByUserId: teacher.id,
        },
      });
      console.log('Attendance created.');
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
