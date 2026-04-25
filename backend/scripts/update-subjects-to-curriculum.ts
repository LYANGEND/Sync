/**
 * Update Subjects to Follow the Official Zambian CDC Curriculum
 *
 * This script:
 * 1. Renames subject codes that don't match the canonical CDC mapping
 * 2. Merges duplicate/redundant subjects (e.g. CA → CTS)
 * 3. Adds missing subjects that exist in the CDC syllabi
 * 4. Validates class-subject assignments against grade ranges
 *
 * Run with:  npx tsx scripts/update-subjects-to-curriculum.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Canonical CDC Subject List ───────────────────────────────────────
// Based on official CDC syllabi PDFs in "Finalised Syllabi" folder

interface SubjectDef {
  name: string;
  code: string;
  minGrade: number;
  maxGrade: number;
}

const CDC_SUBJECTS: SubjectDef[] = [
  // ECE learning areas (-3 to 0)
  { name: 'Early Childhood Education',       code: 'ECE',      minGrade: -3, maxGrade: 0 },
  { name: 'Literacy (ECE)',                   code: 'LITERACY', minGrade: -3, maxGrade: 0 },
  { name: 'Pre-Mathematics & Science (ECE)',  code: 'NUMERACY', minGrade: -3, maxGrade: 0 },
  { name: 'Social & Emotional (ECE)',         code: 'SOCIAL',   minGrade: -3, maxGrade: 0 },
  { name: 'Creative Arts (ECE)',              code: 'CREATIVE', minGrade: -3, maxGrade: 0 },
  { name: 'Psychomotor (ECE)',                code: 'PSYCH',    minGrade: -3, maxGrade: 0 },
  { name: 'Environmental Studies (ECE)',      code: 'ENVIRON',  minGrade: -3, maxGrade: 0 },

  // Primary + Secondary core
  { name: 'Mathematics',                     code: 'MATH',  minGrade: 1, maxGrade: 12 },
  { name: 'English Language',                code: 'ENG',   minGrade: 1, maxGrade: 12 },
  { name: 'Science',                         code: 'SCI',   minGrade: 1, maxGrade: 7 },
  { name: 'Social Studies',                  code: 'SST',   minGrade: 1, maxGrade: 9 },
  { name: 'Physical Education',              code: 'PE',    minGrade: 1, maxGrade: 12 },
  { name: 'Religious Education',             code: 'RE',    minGrade: 1, maxGrade: 12 },
  { name: 'Zambian Languages',               code: 'ZAM',   minGrade: 1, maxGrade: 12 },

  // Primary specific
  { name: 'Creative & Technology Studies',   code: 'CTS',   minGrade: 1, maxGrade: 4 },
  { name: 'Expressive Arts',                 code: 'EA',    minGrade: 5, maxGrade: 7 },

  // Primary + Junior Secondary
  { name: 'ICT',                             code: 'ICT',   minGrade: 3, maxGrade: 12 },
  { name: 'Home Economics',                  code: 'HEC',   minGrade: 5, maxGrade: 9 },

  // Secondary (Form 1-4 / Grade 8-12)
  { name: 'Integrated Science',              code: 'ISCI',    minGrade: 8, maxGrade: 9 },
  { name: 'Biology',                         code: 'BIO',     minGrade: 8, maxGrade: 12 },
  { name: 'Chemistry',                       code: 'CHEM',    minGrade: 8, maxGrade: 12 },
  { name: 'Physics',                         code: 'PHY',     minGrade: 8, maxGrade: 12 },
  { name: 'Additional Mathematics',          code: 'AMATH',   minGrade: 10, maxGrade: 12 },
  { name: 'History',                         code: 'HIST',    minGrade: 8, maxGrade: 12 },
  { name: 'Geography',                       code: 'GEO',     minGrade: 8, maxGrade: 12 },
  { name: 'Civic Education',                 code: 'CIVIC',   minGrade: 8, maxGrade: 12 },
  { name: 'Literature in English',           code: 'LIT',     minGrade: 8, maxGrade: 12 },
  { name: 'Art and Design',                  code: 'ART',     minGrade: 8, maxGrade: 12 },
  { name: 'Musical Arts Education',          code: 'MUSIC',   minGrade: 8, maxGrade: 12 },
  { name: 'Design and Technology',           code: 'DT',      minGrade: 8, maxGrade: 12 },
  { name: 'Commerce',                        code: 'COM',     minGrade: 8, maxGrade: 12 },
  { name: 'Principles of Accounts',          code: 'ACCT',    minGrade: 8, maxGrade: 12 },
  { name: 'Business Studies',                code: 'BSTUD',   minGrade: 8, maxGrade: 12 },
  { name: 'Agricultural Science',            code: 'AGRI',    minGrade: 8, maxGrade: 12 },
  { name: 'Food and Nutrition',              code: 'FN',      minGrade: 8, maxGrade: 12 },
  { name: 'Fashion and Fabrics',             code: 'FF',      minGrade: 8, maxGrade: 12 },
  { name: 'French Language',                 code: 'FRENCH',  minGrade: 8, maxGrade: 12 },
  { name: 'Hospitality Management',          code: 'HOSP',    minGrade: 8, maxGrade: 12 },
  { name: 'Travel and Tourism',              code: 'TOURISM', minGrade: 8, maxGrade: 12 },
];

// ─── Code Renames ─────────────────────────────────────────────────────
// Map old DB codes → new canonical codes
const CODE_RENAMES: Record<string, string> = {
  'CIV':  'CIVIC',
  'ZL':   'ZAM',
  'HE':   'HEC',
  'POA':  'ACCT',
  'BUS':  'BSTUD',
  'COMP': 'ICT',
};

// Subjects to merge (source → target code). Source subject is deleted after
// moving all relationships to the target subject.
const MERGES: Record<string, string> = {
  'CA': 'CTS', // Creative Arts → Creative & Technology Studies
};

async function main() {
  console.log('🎓 Updating subjects to follow official CDC curriculum...\n');

  // ── Step 1: Rename codes ───────────────────────────────────────
  console.log('1️⃣  Renaming mismatched subject codes...');
  for (const [oldCode, newCode] of Object.entries(CODE_RENAMES)) {
    const existing = await prisma.subject.findUnique({ where: { code: oldCode } });
    if (!existing) {
      console.log(`   ⏭️  ${oldCode} not found (already renamed or doesn't exist)`);
      continue;
    }

    // Check if the target code already exists
    const target = await prisma.subject.findUnique({ where: { code: newCode } });
    if (target) {
      console.log(`   ⚠️  ${oldCode} → ${newCode}: target code already exists. Will merge instead.`);
      // Merge: move all relationships from old subject to target
      await mergeSubject(existing.id, target.id, oldCode, newCode);
      continue;
    }

    // Find the canonical name
    const cdcDef = CDC_SUBJECTS.find(s => s.code === newCode);
    await prisma.subject.update({
      where: { id: existing.id },
      data: {
        code: newCode,
        name: cdcDef?.name || existing.name,
      },
    });
    console.log(`   ✅ ${oldCode} → ${newCode} (${cdcDef?.name || existing.name})`);
  }

  // ── Step 2: Merge duplicates ───────────────────────────────────
  console.log('\n2️⃣  Merging duplicate subjects...');
  for (const [sourceCode, targetCode] of Object.entries(MERGES)) {
    const source = await prisma.subject.findUnique({ where: { code: sourceCode } });
    if (!source) {
      console.log(`   ⏭️  ${sourceCode} not found (already merged or doesn't exist)`);
      continue;
    }
    const target = await prisma.subject.findUnique({ where: { code: targetCode } });
    if (!target) {
      // Just rename the source
      const cdcDef = CDC_SUBJECTS.find(s => s.code === targetCode);
      await prisma.subject.update({
        where: { id: source.id },
        data: { code: targetCode, name: cdcDef?.name || source.name },
      });
      console.log(`   ✅ Renamed ${sourceCode} → ${targetCode} (no target existed)`);
      continue;
    }
    await mergeSubject(source.id, target.id, sourceCode, targetCode);
  }

  // ── Step 3: Update existing subject names to CDC standard ──────
  console.log('\n3️⃣  Updating subject names to CDC standard...');
  for (const cdcDef of CDC_SUBJECTS) {
    const existing = await prisma.subject.findUnique({ where: { code: cdcDef.code } });
    if (existing && existing.name !== cdcDef.name) {
      await prisma.subject.update({
        where: { id: existing.id },
        data: { name: cdcDef.name },
      });
      console.log(`   ✅ ${cdcDef.code}: "${existing.name}" → "${cdcDef.name}"`);
    }
  }

  // ── Step 4: Add missing CDC subjects ───────────────────────────
  console.log('\n4️⃣  Adding missing CDC subjects...');
  for (const cdcDef of CDC_SUBJECTS) {
    const existing = await prisma.subject.findUnique({ where: { code: cdcDef.code } });
    if (existing) continue;

    await prisma.subject.create({
      data: { name: cdcDef.name, code: cdcDef.code },
    });
    console.log(`   ✅ Created: ${cdcDef.name} (${cdcDef.code}) — Grade ${cdcDef.minGrade} to ${cdcDef.maxGrade}`);
  }

  // ── Step 5: Reassign class-subject links based on grade ranges ─
  console.log('\n5️⃣  Validating class-subject assignments...');
  const classes = await prisma.class.findMany({
    include: { subjects: true },
  });

  const gradeRangeMap = new Map(CDC_SUBJECTS.map(s => [s.code, { min: s.minGrade, max: s.maxGrade }]));
  let disconnected = 0;
  let connected = 0;

  for (const cls of classes) {
    // Disconnect subjects not valid for this grade
    for (const subj of cls.subjects) {
      const range = gradeRangeMap.get(subj.code);
      if (range && (cls.gradeLevel < range.min || cls.gradeLevel > range.max)) {
        await prisma.class.update({
          where: { id: cls.id },
          data: { subjects: { disconnect: { id: subj.id } } },
        });
        disconnected++;
      }
    }

    // Connect core subjects that should be on this class
    const currentCodes = new Set(cls.subjects.map(s => s.code));
    const coreSubjects = getCoreSubjectsForGrade(cls.gradeLevel);
    for (const code of coreSubjects) {
      if (currentCodes.has(code)) continue;
      const subj = await prisma.subject.findUnique({ where: { code } });
      if (subj) {
        await prisma.class.update({
          where: { id: cls.id },
          data: { subjects: { connect: { id: subj.id } } },
        });
        connected++;
      }
    }
  }
  console.log(`   Disconnected ${disconnected} invalid assignments, connected ${connected} missing core subjects.`);

  // ── Summary ────────────────────────────────────────────────────
  const allSubjects = await prisma.subject.findMany({ orderBy: { code: 'asc' } });
  console.log(`\n✅ Done! ${allSubjects.length} subjects now in database:\n`);
  for (const s of allSubjects) {
    const range = gradeRangeMap.get(s.code);
    console.log(`   ${s.code.padEnd(10)} ${s.name}${range ? ` (Grade ${range.min} to ${range.max})` : ''}`);
  }

  await prisma.$disconnect();
}

/**
 * Get the core/mandatory subjects for a given grade level.
 */
function getCoreSubjectsForGrade(grade: number): string[] {
  if (grade <= 0 && grade >= -3) {
    return ['ECE', 'LITERACY', 'NUMERACY', 'SOCIAL', 'CREATIVE', 'PSYCH', 'ENVIRON'];
  }
  if (grade >= 1 && grade <= 4) {
    return ['MATH', 'ENG', 'SCI', 'SST', 'PE', 'RE', 'CTS', 'ZAM'];
  }
  if (grade >= 5 && grade <= 7) {
    return ['MATH', 'ENG', 'SCI', 'SST', 'PE', 'RE', 'EA', 'ZAM', 'ICT', 'HEC'];
  }
  if (grade >= 8 && grade <= 9) {
    return ['MATH', 'ENG', 'ISCI', 'SST', 'PE', 'RE', 'ZAM', 'ICT', 'CIVIC', 'GEO', 'HIST'];
  }
  if (grade >= 10 && grade <= 12) {
    return ['MATH', 'ENG', 'PE', 'RE', 'CIVIC'];
  }
  return [];
}

/**
 * Merge all relationships from source subject into target, then delete source.
 */
async function mergeSubject(sourceId: string, targetId: string, sourceCode: string, targetCode: string) {
  // Move topics
  await prisma.topic.updateMany({
    where: { subjectId: sourceId },
    data: { subjectId: targetId },
  });

  // Move assessments
  await prisma.assessment.updateMany({
    where: { subjectId: sourceId },
    data: { subjectId: targetId },
  });

  // Move lesson plans
  await prisma.lessonPlan.updateMany({
    where: { subjectId: sourceId },
    data: { subjectId: targetId },
  });

  // Move class assignments: get classes linked to source, connect them to target
  const classesWithSource = await prisma.class.findMany({
    where: { subjects: { some: { id: sourceId } } },
    select: { id: true },
  });
  for (const cls of classesWithSource) {
    await prisma.class.update({
      where: { id: cls.id },
      data: {
        subjects: {
          disconnect: { id: sourceId },
          connect: { id: targetId },
        },
      },
    });
  }

  // Move grades (if model exists)
  try {
    await (prisma as any).grade.updateMany({
      where: { subjectId: sourceId },
      data: { subjectId: targetId },
    });
  } catch {}

  // Move homework
  try {
    await (prisma as any).homework.updateMany({
      where: { subjectId: sourceId },
      data: { subjectId: targetId },
    });
  } catch {}

  // Delete source subject
  await prisma.subject.delete({ where: { id: sourceId } });
  console.log(`   ✅ Merged ${sourceCode} → ${targetCode} (moved all relationships, deleted ${sourceCode})`);
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
