/**
 * ECE Subject Cleanup & Merge Script
 * ===================================
 * Consolidates 15 overlapping ECE subjects into 6 clean learning areas
 * matching the Zambian ECE curriculum framework.
 *
 * KEEPS (6):
 *   ECE-LL   → Language & Literacy (ECE)          [already has 28 topics]
 *   ECE-MATH → Mathematics (ECE)
 *   ECE-ENV  → Environmental Studies (ECE)
 *   ECE-ART  → Expressive & Creative Arts (ECE)
 *   ECE-RE   → Religious Education (ECE)
 *   ECE-PHY  → Physical Development (ECE)
 *
 * MERGES INTO kept subjects (9 removed):
 *   ECE-LIT, ECE-LA, ECE-LANG  → ECE-LL
 *   ECE-MA, ECE-NUM             → ECE-MATH
 *   ECE-EA                      → ECE-ENV
 *   ECE-CA, ECE-PCA             → ECE-ART
 *   ECE-REL                     → ECE-RE
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Merge map: oldCode → keepCode
const MERGE_MAP: Record<string, string> = {
  'ECE-LIT':  'ECE-LL',
  'ECE-LA':   'ECE-LL',
  'ECE-LANG': 'ECE-LL',
  'ECE-MA':   'ECE-MATH',
  'ECE-NUM':  'ECE-MATH',
  'ECE-EA':   'ECE-ENV',
  'ECE-CA':   'ECE-ART',
  'ECE-PCA':  'ECE-ART',
  'ECE-REL':  'ECE-RE',
};

// Rename map: code → new friendly name
const RENAME_MAP: Record<string, string> = {
  'ECE-LL':   'Language & Literacy (ECE)',
  'ECE-MATH': 'Mathematics (ECE)',
  'ECE-ENV':  'Environmental Studies (ECE)',
  'ECE-ART':  'Expressive & Creative Arts (ECE)',
  'ECE-RE':   'Religious Education (ECE)',
  'ECE-PHY':  'Physical Development (ECE)',
};

async function main() {
  console.log('=== ECE SUBJECT CLEANUP ===\n');

  // 1. Gather all ECE subjects
  const allEce = await prisma.subject.findMany({
    where: { code: { startsWith: 'ECE-' } },
    select: { id: true, code: true, name: true },
  });
  console.log(`Found ${allEce.length} ECE subjects`);

  // Build lookup: code → id
  const codeToId: Record<string, string> = {};
  allEce.forEach((s: any) => { codeToId[s.code] = s.id; });

  // 2. Perform merges
  const codesToDelete: string[] = Object.keys(MERGE_MAP);
  let totalTopicsMoved = 0;
  let totalLessonPlansMoved = 0;
  let totalAssessmentsMoved = 0;

  for (const [oldCode, keepCode] of Object.entries(MERGE_MAP)) {
    const oldId = codeToId[oldCode];
    const keepId = codeToId[keepCode];
    if (!oldId) { console.log(`  SKIP ${oldCode} — not found in DB`); continue; }
    if (!keepId) { console.log(`  SKIP ${oldCode} → ${keepCode} — target not found`); continue; }

    // Move topics
    const topicResult = await prisma.topic.updateMany({
      where: { subjectId: oldId },
      data: { subjectId: keepId },
    });
    totalTopicsMoved += topicResult.count;

    // Move lesson plans
    const lpResult = await prisma.lessonPlan.updateMany({
      where: { subjectId: oldId },
      data: { subjectId: keepId },
    });
    totalLessonPlansMoved += lpResult.count;

    // Move assessments
    const assResult = await prisma.assessment.updateMany({
      where: { subjectId: oldId },
      data: { subjectId: keepId },
    });
    totalAssessmentsMoved += assResult.count;

    // Move teacher assignments (ClassSubjectTeacher)
    // Delete old ones that would conflict (same classId+keepSubjectId already exists)
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "class_subject_teachers" WHERE "subjectId" = $1`,
        oldId,
      );
    } catch { /* table may not exist */ }

    // Move student grades (StudentGrade)
    try {
      await prisma.studentGrade.updateMany({
        where: { subjectId: oldId },
        data: { subjectId: keepId },
      });
    } catch { /* may not exist or unique constraint */ }

    // Move virtual classrooms
    try {
      await prisma.virtualClassroom.updateMany({
        where: { subjectId: oldId },
        data: { subjectId: keepId },
      });
    } catch { /* nullable field */ }

    console.log(`  ${oldCode} → ${keepCode}: ${topicResult.count} topics, ${lpResult.count} plans, ${assResult.count} assessments moved`);
  }

  console.log(`\nTotals moved: ${totalTopicsMoved} topics, ${totalLessonPlansMoved} lesson plans, ${totalAssessmentsMoved} assessments`);

  // 3. Update class-subject relationships (many-to-many _ClassSubjects)
  //    For each class that has an old subject, ensure it has the keep subject, then remove the old one
  for (const [oldCode, keepCode] of Object.entries(MERGE_MAP)) {
    const oldId = codeToId[oldCode];
    const keepId = codeToId[keepCode];
    if (!oldId || !keepId) continue;

    // Find classes linked to the old subject
    const classesWithOld = await prisma.class.findMany({
      where: { subjects: { some: { id: oldId } } },
      select: { id: true, name: true },
    });

    for (const cls of classesWithOld) {
      // Ensure keep subject is connected
      await prisma.class.update({
        where: { id: cls.id },
        data: { subjects: { connect: { id: keepId } } },
      });
      // Disconnect old subject
      await prisma.class.update({
        where: { id: cls.id },
        data: { subjects: { disconnect: { id: oldId } } },
      });
    }
    if (classesWithOld.length > 0) {
      console.log(`  ${oldCode}: Updated ${classesWithOld.length} class mappings → ${keepCode}`);
    }
  }

  // 4. Delete old subjects
  const idsToDelete = codesToDelete.map(c => codeToId[c]).filter(Boolean);
  if (idsToDelete.length > 0) {
    const deleteResult = await prisma.subject.deleteMany({
      where: { id: { in: idsToDelete } },
    });
    console.log(`\nDeleted ${deleteResult.count} duplicate subjects`);
  }

  // 5. Rename kept subjects
  for (const [code, newName] of Object.entries(RENAME_MAP)) {
    const id = codeToId[code];
    if (!id) continue;
    await prisma.subject.update({
      where: { id },
      data: { name: newName },
    });
    console.log(`  Renamed ${code} → "${newName}"`);
  }

  // 6. Final verification
  const remaining = await prisma.subject.findMany({
    where: { code: { startsWith: 'ECE-' } },
    select: { code: true, name: true },
    orderBy: { code: 'asc' },
  });
  console.log(`\n=== FINAL ECE SUBJECTS (${remaining.length}) ===`);
  remaining.forEach((s: any) => console.log(`  ${s.code.padEnd(12)} ${s.name}`));

  const topicCount = await prisma.topic.count({
    where: { subject: { code: { startsWith: 'ECE-' } } },
  });
  console.log(`\nTotal ECE topics: ${topicCount}`);
  console.log('\n✅ Done!');
}

main()
  .catch(e => { console.error('ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
