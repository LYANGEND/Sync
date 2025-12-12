import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Check if super admin already exists
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' }
  });

  if (!existingAdmin) {
    // Create super admin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const superAdmin = await prisma.user.create({
      data: {
        email: 'admin@sync.com',
        passwordHash: hashedPassword,
        fullName: 'Super Admin',
        role: 'SUPER_ADMIN',
      }
    });

    console.log('✅ Created super admin:', superAdmin.email);
  } else {
    console.log('✅ Super admin already exists');
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
  for (const classData of classesToCreate) {
    const existingClass = await prisma.class.findFirst({
      where: {
        name: classData.name,
        academicTermId: currentTerm.id,
      }
    });

    if (!existingClass) {
      await prisma.class.create({
        data: {
          name: classData.name,
          gradeLevel: classData.gradeLevel,
          teacherId: teacher.id,
          academicTermId: currentTerm.id,
        }
      });
      console.log(`✅ Created class: ${classData.name} (Grade Level: ${classData.gradeLevel})`);
    } else {
      console.log(`✅ Class already exists: ${classData.name}`);
    }
  }

  console.log('🎉 Database seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
