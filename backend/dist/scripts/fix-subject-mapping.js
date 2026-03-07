"use strict";
/**
 * FIX SUBJECT MAPPING
 * ====================
 * 1. Creates missing O-Level subject records (Biology, Chemistry, Physics, etc.)
 * 2. Deletes incorrectly merged Form 1-4 topics from umbrella subjects
 *
 * Run: cd backend && npx ts-node --transpile-only scripts/fix-subject-mapping.ts
 * Then re-run: npx ts-node --transpile-only scripts/seed-syllabus.ts
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/utils/prisma");
// New subjects that need to be created for Form 1-4 O-Level
const NEW_SUBJECTS = [
    { code: 'BIO', name: 'Biology' },
    { code: 'CHEM', name: 'Chemistry' },
    { code: 'PHYS', name: 'Physics' },
    { code: 'AGRI_SCI', name: 'Agricultural Science' },
    { code: 'GEOG', name: 'Geography' },
    { code: 'HIST', name: 'History' },
    { code: 'CIVIC', name: 'Civic Education' },
    { code: 'TRAV_TOUR', name: 'Travel and Tourism' },
    { code: 'FASH_FAB', name: 'Fashion and Fabrics' },
    { code: 'FOOD_NUT', name: 'Food and Nutrition' },
    { code: 'HOSP_MGT', name: 'Hospitality Management' },
    { code: 'FRENCH', name: 'French Language' },
    { code: 'LIT_ENG', name: 'Literature in English' },
    { code: 'ICT', name: 'Information and Communication Technology' },
    { code: 'COMM', name: 'Commerce and Accounts' },
    { code: 'DES_TECH', name: 'Design and Technology' },
    { code: 'ADD_MATH', name: 'Additional Mathematics' },
];
// Umbrella subjects that had multiple PDFs incorrectly merged into them.
// We need to delete their Form 1-4 (grade 8-11) topics so we can re-seed correctly.
const SUBJECTS_TO_CLEAN = [
    'INT_SCI', // Had Biology + Chemistry + Physics + Agri Science all mixed in
    'SOC_ST', // Had Geography + History + Civic Education + Travel & Tourism
    'HOME_ECO', // Had Fashion & Fabrics + Food & Nutrition + Hospitality
    'CTS', // Had Commerce + Design & Technology + overlaps
    'ENG', // Had English + French + Literature all mixed in
    'COMP', // Had Computer Science + ICT mixed in
];
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('╔══════════════════════════════════════════════════════╗');
        console.log('║   FIX SUBJECT MAPPING                              ║');
        console.log('╚══════════════════════════════════════════════════════╝\n');
        // ─── Step 1: Create missing subjects ───
        console.log('1️⃣  Creating missing O-Level subjects...\n');
        let created = 0;
        let skipped = 0;
        for (const sub of NEW_SUBJECTS) {
            const existing = yield prisma_1.prisma.subject.findFirst({ where: { code: sub.code } });
            if (existing) {
                console.log(`   ⏭️  ${sub.code.padEnd(12)} ${sub.name} (already exists)`);
                skipped++;
                continue;
            }
            yield prisma_1.prisma.subject.create({ data: { name: sub.name, code: sub.code } });
            console.log(`   ✅ ${sub.code.padEnd(12)} ${sub.name} — CREATED`);
            created++;
        }
        console.log(`\n   Created: ${created}, Skipped: ${skipped}\n`);
        // ─── Step 2: Clean incorrectly merged Form 1-4 topics ───
        console.log('2️⃣  Cleaning incorrectly merged Form 1-4 topics from umbrella subjects...\n');
        for (const code of SUBJECTS_TO_CLEAN) {
            const subject = yield prisma_1.prisma.subject.findFirst({ where: { code } });
            if (!subject) {
                console.log(`   ⚠️  ${code} — subject not found, skipping`);
                continue;
            }
            // Find all Form 1-4 topics (grade levels 8-11)
            const form14Topics = yield prisma_1.prisma.topic.findMany({
                where: {
                    subjectId: subject.id,
                    gradeLevel: { in: [8, 9, 10, 11] },
                },
                select: { id: true },
            });
            if (form14Topics.length === 0) {
                console.log(`   ⏭️  ${code.padEnd(12)} ${subject.name} — no Form 1-4 topics to clean`);
                continue;
            }
            const topicIds = form14Topics.map((t) => t.id);
            // Delete subtopics first (cascade doesn't auto-happen via deleteMany)
            const deletedSubs = yield prisma_1.prisma.subTopic.deleteMany({
                where: { topicId: { in: topicIds } },
            });
            // Delete the topics
            const deletedTopics = yield prisma_1.prisma.topic.deleteMany({
                where: { id: { in: topicIds } },
            });
            console.log(`   🗑️  ${code.padEnd(12)} ${subject.name} — deleted ${deletedTopics.count} topics, ${deletedSubs.count} subtopics`);
        }
        // ─── Summary ───
        const allSubjects = yield prisma_1.prisma.subject.count();
        const allTopics = yield prisma_1.prisma.topic.count();
        const allSubTopics = yield prisma_1.prisma.subTopic.count();
        console.log('\n╔══════════════════════════════════════════════════════╗');
        console.log(`║  DONE — DB now has:                                 ║`);
        console.log(`║  ${allSubjects.toString().padEnd(4)} subjects                                    ║`);
        console.log(`║  ${allTopics.toString().padEnd(4)} topics (remaining after cleanup)              ║`);
        console.log(`║  ${allSubTopics.toString().padEnd(4)} subtopics (remaining after cleanup)           ║`);
        console.log('╚══════════════════════════════════════════════════════╝');
        console.log('\n👉 Now re-run: npx ts-node --transpile-only scripts/seed-syllabus.ts');
    });
}
main()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
