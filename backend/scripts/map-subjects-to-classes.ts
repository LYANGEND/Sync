/**
 * MAP SUBJECTS TO CLASSES BY GRADE LEVEL
 * ========================================
 * 1. Creates missing Form 1-4 classes
 * 2. Maps the correct subjects to each class based on Zambian curriculum:
 *    - ECE (Baby/Middle/Reception): ECE-specific subjects
 *    - Primary (Grade 1-7): Primary subjects
 *    - Secondary (Form 1-4): O-Level subjects with core + electives
 *
 * Run: cd backend && npx ts-node --transpile-only scripts/map-subjects-to-classes.ts
 */

import { prisma } from '../src/utils/prisma';

// ─── ZAMBIAN CURRICULUM SUBJECT MAPPING ───
// Key = grade level range, Value = subject codes that should be offered

const ECE_SUBJECTS = [
  'ECE-LIT', 'ECE-NUM', 'ECE-ENV', 'ECE-CA', 'ECE-PHY',
  'ECE-LANG', 'ECE-LA', 'ECE-LL', 'ECE-MA', 'ECE-MATH',
  'ECE-RE', 'ECE-REL', 'ECE-PCA', 'ECE-ART', 'ECE-EA',
];

// Primary Grade 1-4: foundational subjects
const PRIMARY_LOWER_SUBJECTS = [
  'ENG', 'MATH', 'SCI', 'SST', 'CA', 'PE', 'RE',
  'COMP', 'ZAM_LANG',
];

// Primary Grade 5-7: adds more specialization
const PRIMARY_UPPER_SUBJECTS = [
  'ENG', 'MATH', 'SCI', 'SST', 'CA', 'PE', 'RE',
  'COMP', 'ZAM_LANG', 'HOME_ECO', 'CTS', 'TECH_ST',
];

// Form 1-2 Core subjects
const FORM_1_2_CORE = [
  'ENG', 'MATH', 'INT_SCI', 'SOC_ST', 'COMP', 'PE', 'RE',
  'CIVIC', 'ZAM_LANG',
];

// Form 1-2 Electives (students choose some)
const FORM_1_2_ELECTIVES = [
  'BIO', 'CHEM', 'PHYS', 'GEOG', 'HIST',
  'HOME_ECO', 'AGRI_SCI', 'ART_DES', 'MUSIC',
  'FRENCH', 'LIT_ENG', 'ICT', 'CTS',
  'FASH_FAB', 'FOOD_NUT',
];

// Form 3-4 Core subjects
const FORM_3_4_CORE = [
  'ENG', 'MATH', 'COMP', 'PE', 'RE', 'CIVIC',
];

// Form 3-4 Electives (wider choice for O-Level specialization)
const FORM_3_4_ELECTIVES = [
  'BIO', 'CHEM', 'PHYS', 'ADD_MATH', 'GEOG', 'HIST',
  'HOME_ECO', 'AGRI_SCI', 'ART_DES', 'MUSIC',
  'FRENCH', 'LIT_ENG', 'ICT', 'INT_SCI', 'SOC_ST',
  'COMM', 'DES_TECH', 'TRAV_TOUR',
  'FASH_FAB', 'FOOD_NUT', 'HOSP_MGT',
  'ZAM_LANG', 'EXP_ARTS',
];

// Classes to create if missing
const CLASSES_TO_ENSURE = [
  { name: 'Baby Class', gradeLevel: -2 },
  { name: 'Middle Class', gradeLevel: -1 },
  { name: 'Reception', gradeLevel: 0 },
  { name: 'Grade 1', gradeLevel: 1 },
  { name: 'Grade 2', gradeLevel: 2 },
  { name: 'Grade 3', gradeLevel: 3 },
  { name: 'Grade 4', gradeLevel: 4 },
  { name: 'Grade 5', gradeLevel: 5 },
  { name: 'Grade 6', gradeLevel: 6 },
  { name: 'Grade 7', gradeLevel: 7 },
  { name: 'Form 1', gradeLevel: 8 },
  { name: 'Form 2', gradeLevel: 9 },
  { name: 'Form 3', gradeLevel: 10 },
  { name: 'Form 4', gradeLevel: 11 },
];

function getSubjectCodesForGradeLevel(gradeLevel: number): string[] {
  if (gradeLevel <= 0) return ECE_SUBJECTS;
  if (gradeLevel <= 4) return PRIMARY_LOWER_SUBJECTS;
  if (gradeLevel <= 7) return PRIMARY_UPPER_SUBJECTS;
  if (gradeLevel <= 9) return [...FORM_1_2_CORE, ...FORM_1_2_ELECTIVES];
  return [...FORM_3_4_CORE, ...FORM_3_4_ELECTIVES];
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   MAP SUBJECTS TO CLASSES BY GRADE LEVEL               ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Get a teacher and active term for creating new classes
  const activeTerm = await prisma.academicTerm.findFirst({ where: { isActive: true } });
  if (!activeTerm) {
    console.error('❌ No active academic term found!');
    return process.exit(1);
  }

  // Use admin or first teacher as default class teacher
  const teacher = await prisma.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'TEACHER'] } },
    select: { id: true, fullName: true },
  });
  if (!teacher) {
    console.error('❌ No teacher/admin user found!');
    return process.exit(1);
  }

  console.log(`   Using term: ${activeTerm.name}`);
  console.log(`   Default teacher: ${teacher.fullName}\n`);

  // Load all subjects into a lookup map
  const allSubjects = await prisma.subject.findMany();
  const subjectByCode = new Map(allSubjects.map(s => [s.code, s]));

  // ─── Step 1: Ensure all classes exist ───
  console.log('1️⃣  Ensuring all classes exist...\n');
  const existingClasses = await prisma.class.findMany({
    select: { id: true, name: true, gradeLevel: true },
  });

  let classesCreated = 0;
  for (const cls of CLASSES_TO_ENSURE) {
    const existing = existingClasses.find(c => c.gradeLevel === cls.gradeLevel);
    if (existing) {
      console.log(`   ⏭️  ${cls.name.padEnd(16)} (gradeLevel ${cls.gradeLevel}) — already exists as "${existing.name}"`);
      continue;
    }

    await prisma.class.create({
      data: {
        name: cls.name,
        gradeLevel: cls.gradeLevel,
        teacherId: teacher.id,
        academicTermId: activeTerm.id,
      },
    });
    console.log(`   ✅ ${cls.name.padEnd(16)} (gradeLevel ${cls.gradeLevel}) — CREATED`);
    classesCreated++;
  }
  console.log(`\n   Classes created: ${classesCreated}\n`);

  // ─── Step 2: Map subjects to classes ───
  console.log('2️⃣  Mapping subjects to classes by grade level...\n');

  // Re-fetch all classes after creation
  const allClasses = await prisma.class.findMany({
    select: { id: true, name: true, gradeLevel: true },
    orderBy: { gradeLevel: 'asc' },
  });

  let totalMapped = 0;

  for (const cls of allClasses) {
    const desiredCodes = getSubjectCodesForGradeLevel(cls.gradeLevel);

    // Resolve codes to actual subject IDs (skip codes that don't exist)
    const subjectIds: string[] = [];
    const resolvedNames: string[] = [];
    const missingCodes: string[] = [];

    for (const code of desiredCodes) {
      const sub = subjectByCode.get(code);
      if (sub) {
        subjectIds.push(sub.id);
        resolvedNames.push(sub.code);
      } else {
        missingCodes.push(code);
      }
    }

    // Use Prisma's set to replace the entire subjects list for this class
    await prisma.class.update({
      where: { id: cls.id },
      data: {
        subjects: {
          set: subjectIds.map(id => ({ id })),
        },
      },
    });

    const label = cls.gradeLevel <= 0 ? 'ECE' : cls.gradeLevel <= 7 ? 'Primary' : 'Secondary';
    console.log(`   ✅ ${cls.name.padEnd(16)} (${label}) → ${subjectIds.length} subjects`);
    if (missingCodes.length > 0) {
      console.log(`      ⚠️  Missing codes: ${missingCodes.join(', ')}`);
    }
    totalMapped += subjectIds.length;
  }

  // ─── Summary ───
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  DONE                                                    ║`);
  console.log(`║  Classes: ${allClasses.length.toString().padEnd(4)} (${classesCreated} new)                              ║`);
  console.log(`║  Total subject-class mappings: ${totalMapped.toString().padEnd(4)}                      ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  console.log('\n📋 Final class → subject mapping:\n');
  const finalClasses = await prisma.class.findMany({
    select: { name: true, gradeLevel: true, subjects: { select: { code: true, name: true } } },
    orderBy: { gradeLevel: 'asc' },
  });
  for (const c of finalClasses) {
    console.log(`   ${c.name} (gradeLevel=${c.gradeLevel}) — ${c.subjects.length} subjects`);
    console.log(`      ${c.subjects.map(s => s.code).join(', ')}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
