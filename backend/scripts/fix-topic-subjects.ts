/**
 * FIX TOPIC → SUBJECT MAPPING
 * =============================
 * Topics were seeded under PRI-* subjects but classes use the main subjects.
 * This script reassigns topics to the correct subjects so they appear in the UI.
 *
 * Fixes:
 *   PRI-ENG  (grades 1-3)  → ENG    (English Language)
 *   PRI-ART  (grades 5-7)  → CA     (Creative Arts)
 *   PRI-TECH (grades 5-7)  → TECH_ST (Technology Studies)
 *   ECE-LL   (grade -3)    → remap to grade -2 (Baby Class)
 *
 * Run: cd backend && npx ts-node --transpile-only scripts/fix-topic-subjects.ts
 */

import { prisma } from '../src/utils/prisma';

// Topic reassignment: from PRI-* subject → main subject used by classes
const REASSIGN_MAP: { fromCode: string; toCode: string; label: string }[] = [
  { fromCode: 'PRI-ENG',  toCode: 'ENG',     label: 'Primary English → English Language' },
  { fromCode: 'PRI-ART',  toCode: 'CA',      label: 'Primary Expressive Arts → Creative Arts' },
  { fromCode: 'PRI-TECH', toCode: 'TECH_ST',  label: 'Primary Technology → Technology Studies' },
];

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   FIX TOPIC → SUBJECT MAPPING                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ─── Step 1: Reassign PRI-* topics to class-linked subjects ───
  console.log('1️⃣  Reassigning PRI-* topics to correct subjects...\n');

  for (const { fromCode, toCode, label } of REASSIGN_MAP) {
    const fromSubject = await prisma.subject.findFirst({ where: { code: fromCode } });
    const toSubject = await prisma.subject.findFirst({ where: { code: toCode } });

    if (!fromSubject) {
      console.log(`   ⚠️  ${fromCode} not found, skipping`);
      continue;
    }
    if (!toSubject) {
      console.log(`   ⚠️  ${toCode} not found, skipping`);
      continue;
    }

    const topicCount = await prisma.topic.count({ where: { subjectId: fromSubject.id } });
    if (topicCount === 0) {
      console.log(`   ⏭️  ${label} — no topics to move`);
      continue;
    }

    // Move all topics from PRI-* subject to the main subject
    const updated = await prisma.topic.updateMany({
      where: { subjectId: fromSubject.id },
      data: { subjectId: toSubject.id },
    });

    console.log(`   ✅ ${label} — moved ${updated.count} topics`);
  }

  // ─── Step 2: Fix orphaned ECE-LL grade -3 topics → grade -2 ───
  console.log('\n2️⃣  Fixing orphaned ECE grade -3 topics (no class at -3)...\n');

  const eceLL = await prisma.subject.findFirst({ where: { code: 'ECE-LL' } });
  if (eceLL) {
    const orphaned = await prisma.topic.count({
      where: { subjectId: eceLL.id, gradeLevel: -3 },
    });

    if (orphaned > 0) {
      // Check if grade -2 already has ECE-LL topics — if so, adjust orderIndex
      const existingAt2 = await prisma.topic.count({
        where: { subjectId: eceLL.id, gradeLevel: -2 },
      });

      await prisma.topic.updateMany({
        where: { subjectId: eceLL.id, gradeLevel: -3 },
        data: { gradeLevel: -2 },
      });

      console.log(`   ✅ ECE-LL: moved ${orphaned} topics from grade -3 → grade -2 (Baby Class)`);
      if (existingAt2 > 0) {
        console.log(`   ℹ️  Baby Class now has ${existingAt2 + orphaned} ECE-LL topics total`);
      }
    } else {
      console.log('   ⏭️  No orphaned ECE-LL topics at grade -3');
    }
  }

  // ─── Summary ───
  console.log('\n3️⃣  Verifying — topics per grade with correct subjects:\n');

  const classes = await prisma.class.findMany({
    include: { subjects: { select: { id: true, code: true, name: true } } },
    orderBy: { gradeLevel: 'asc' },
  });

  for (const cls of classes) {
    let topicTotal = 0;
    const subjectCounts: string[] = [];

    for (const sub of cls.subjects) {
      const count = await prisma.topic.count({
        where: { subjectId: sub.id, gradeLevel: cls.gradeLevel },
      });
      if (count > 0) {
        topicTotal += count;
        subjectCounts.push(`${sub.code}:${count}`);
      }
    }

    if (topicTotal > 0) {
      console.log(`   ${cls.name.padEnd(18)} (gl=${cls.gradeLevel.toString().padStart(3)}) — ${topicTotal} topics [${subjectCounts.join(', ')}]`);
    } else {
      console.log(`   ${cls.name.padEnd(18)} (gl=${cls.gradeLevel.toString().padStart(3)}) — ⚠️  0 topics`);
    }
  }

  console.log('\n✅ Done! Topics should now appear in class dropdowns.\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
