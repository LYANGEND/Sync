import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting multi-tenancy migration...');

  // 1. Create or Get Default School
  // We use 'default-school' as the slug for the primary tenant
  let defaultSchool = await prisma.school.findUnique({
    where: { slug: 'default-school' }
  });

  if (!defaultSchool) {
    console.log('Creating default school...');
    
    // Try to get settings from SchoolSettings if exists
    // Note: We use a try-catch block because SchoolSettings might be removed in future schema versions
    // but for this migration step, it should exist.
    let settings;
    try {
      settings = await prisma.schoolSettings.findFirst();
    } catch (e) {
      console.log('Could not read SchoolSettings, using defaults.');
    }
    
    defaultSchool = await prisma.school.create({
      data: {
        name: settings?.schoolName || 'Default School',
        slug: 'default-school',
        address: settings?.schoolAddress,
        phone: settings?.schoolPhone,
        email: settings?.schoolEmail,
        website: settings?.schoolWebsite,
        logoUrl: settings?.logoUrl,
        
        // Copy communication settings
        smtpHost: settings?.smtpHost,
        smtpPort: settings?.smtpPort,
        smtpSecure: settings?.smtpSecure ?? true,
        smtpUser: settings?.smtpUser,
        smtpPassword: settings?.smtpPassword,
        smtpFromEmail: settings?.smtpFromEmail,
        smtpFromName: settings?.smtpFromName,
        
        smsProvider: settings?.smsProvider,
        smsApiKey: settings?.smsApiKey,
        smsApiSecret: settings?.smsApiSecret,
        smsSenderId: settings?.smsSenderId,
      }
    });
    console.log(`Created school: ${defaultSchool.name} (${defaultSchool.id})`);
  } else {
    console.log(`Using existing school: ${defaultSchool.name} (${defaultSchool.id})`);
  }

  const schoolId = defaultSchool.id;

  // 2. Update all models
  // List of models that have the schoolId field
  const models = [
    'user',
    'student',
    'class',
    'subject',
    'academicTerm',
    'notification',
    'feeTemplate',
    'scholarship',
    'gradingScale'
  ];

  for (const modelName of models) {
    console.log(`Updating ${modelName}...`);
    try {
      // @ts-ignore - Dynamic access to prisma models
      const result = await prisma[modelName].updateMany({
        where: {
          schoolId: null
        },
        data: {
          schoolId: schoolId
        }
      });
      console.log(`Updated ${result.count} ${modelName} records.`);
    } catch (error) {
      console.error(`Failed to update ${modelName}:`, error);
    }
  }

  console.log('Migration complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
