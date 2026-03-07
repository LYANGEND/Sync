/**
 * SYLLABUS PDF → DATABASE SEEDER
 * ================================
 * Reads all Zambian curriculum PDFs from Finalised Syllabi/ folder,
 * uses AI to extract structured topics + subtopics, and seeds them into the DB.
 * 
 * Usage: cd backend && npx ts-node --transpile-only scripts/seed-syllabus.ts
 * 
 * Idempotent: Uses upsert-like logic (checks existing before creating)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { prisma } from '../src/utils/prisma';
import aiService from '../src/services/aiService';

// ==========================================
// PDF → SUBJECT MAPPING
// ==========================================
// Maps each PDF filename to the correct subject code(s) and grade levels.
// Grade levels: ECE = -3 to -1, Primary = 1-7, Form 1-4 = 8-11 (grade 8=Form1, 9=Form2, 10=Form3, 11=Form4)

interface PdfMapping {
  file: string;
  folder: 'Form 1 - 4' | 'Primary Education' | 'Early Childhood Education';
  subjectCodes: string[];      // Subject codes to match
  gradeLevels: number[];       // Grade levels this PDF covers
  subjectNameFallback: string; // If subject not found in DB, use this name
}

const PDF_MAPPINGS: PdfMapping[] = [
  // ===== FORM 1-4 (Grades 8-11) — Each PDF → its OWN subject =====
  { file: 'MATHEMATICS-O-LEVEL-FORMS-1-4.pdf', folder: 'Form 1 - 4', subjectCodes: ['MATH'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Mathematics' },
  { file: 'MATHEMATICS-II-SYLLABUS.pdf', folder: 'Form 1 - 4', subjectCodes: ['ADD_MATH'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Additional Mathematics' },
  { file: 'ENGLISH-SYLABUS-FORM-1-4-O-LEVELCAMERA-READY.pdf', folder: 'Form 1 - 4', subjectCodes: ['ENG'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'English Language' },
  { file: 'BIOLOGY-SYLABUS-O-LEVEL-FORM-1-4.pdf', folder: 'Form 1 - 4', subjectCodes: ['BIO'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Biology' },
  { file: 'CHEMISTRY-SYLLABUS.pdf', folder: 'Form 1 - 4', subjectCodes: ['CHEM'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Chemistry' },
  { file: 'PHYSICS-SYLLABUS-O-LEVEL-FORM-1-4.pdf', folder: 'Form 1 - 4', subjectCodes: ['PHYS'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Physics' },
  { file: 'GEOGRAPHY-SYLLABUS.pdf', folder: 'Form 1 - 4', subjectCodes: ['GEOG'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Geography' },
  { file: 'HISTORY-SYLLABUS-FORMS-1-4.pdf', folder: 'Form 1 - 4', subjectCodes: ['HIST'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'History' },
  { file: 'CIVIC-EDUCATION-SYLLABUS-SCIENCE-O-LEVEL-SYLLABUS-FORM-1-4.pdf', folder: 'Form 1 - 4', subjectCodes: ['CIVIC'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Civic Education' },
  { file: 'RELIGIOUS-EDUCATION-SYLLABUS.pdf', folder: 'Form 1 - 4', subjectCodes: ['RE'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Religious Education' },
  { file: 'COMPUTER_-SCIENCE-ORDINARY-SYLLABI-FORM-1-4.pdf', folder: 'Form 1 - 4', subjectCodes: ['COMP'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Computer Science' },
  { file: 'ICT_ORDINARY-LEVEL-SYLLABUS-FORMS-1-4.pdf', folder: 'Form 1 - 4', subjectCodes: ['ICT'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Information and Communication Technology' },
  { file: 'COMMERCE-AND-PRINCIPLES-OF-ACCOUNTS-SYLABUS-CAMERA-READY-O-LEVEL-FORM-1-4.pdf', folder: 'Form 1 - 4', subjectCodes: ['COMM'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Commerce and Accounts' },
  { file: 'ART-AND-DESIGN-SYLLABUS-FINAL.pdf', folder: 'Form 1 - 4', subjectCodes: ['ART_DES'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Art and Design' },
  { file: 'MUSIC-ARTS-O-LEVEL-SYLLABUS-FORM-1-4-CAMERA-READY-1.pdf', folder: 'Form 1 - 4', subjectCodes: ['MUSIC'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Music' },
  { file: 'PHYSICAL-EDUCATION-SYLLABUS-FORM-1-4.pdf', folder: 'Form 1 - 4', subjectCodes: ['PE'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Physical Education' },
  { file: 'FRENCH-LANGUAGE.pdf', folder: 'Form 1 - 4', subjectCodes: ['FRENCH'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'French Language' },
  { file: 'LITERATURE-IN-ENGLISH-SYLABUS-O-LEVEL-FORM-1-4.pdf', folder: 'Form 1 - 4', subjectCodes: ['LIT_ENG'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Literature in English' },
  { file: 'ZAMBIAN-LANGUAGES-ORDINARY-LEVEL-SYLLABUS-FORM-1-4-FINAL.pdf', folder: 'Form 1 - 4', subjectCodes: ['ZAM_LANG'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Zambian Languages' },
  { file: 'AGRICULTURAL-SCIENCE-O-LEVEL-SYLLABUS-FORM-1-4.pdf', folder: 'Form 1 - 4', subjectCodes: ['AGRI_SCI'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Agricultural Science' },
  { file: 'DESIGN-AND-TECHNOLOGY-STUDIES.pdf', folder: 'Form 1 - 4', subjectCodes: ['DES_TECH'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Design and Technology' },
  { file: 'FASHION-AND-FABRICS-SYLABUS-O-LEVEL-FORM-1-4.pdf', folder: 'Form 1 - 4', subjectCodes: ['FASH_FAB'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Fashion and Fabrics' },
  { file: 'FOOD-AND-NUTRITION-SYLLABUS-FINAL-07-02-2024.pdf', folder: 'Form 1 - 4', subjectCodes: ['FOOD_NUT'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Food and Nutrition' },
  { file: 'HOSPITALITY-MANAGEMENT.pdf', folder: 'Form 1 - 4', subjectCodes: ['HOSP_MGT'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Hospitality Management' },
  { file: 'TRAVEL-AND-TOURISM-SYLLABUS.pdf', folder: 'Form 1 - 4', subjectCodes: ['TRAV_TOUR'], gradeLevels: [8, 9, 10, 11], subjectNameFallback: 'Travel and Tourism' },

  // ===== PRIMARY EDUCATION (Grades 1-7) =====
  { file: 'LOWER-PRIMARY-SYLLABI-GRADE-1-3-FINAL-CAMERA-REDY-1.pdf', folder: 'Primary Education', subjectCodes: ['PRI-ENG', 'PRI-MATH', 'PRI-SCI', 'PRI-SST'], gradeLevels: [1, 2, 3], subjectNameFallback: 'Lower Primary' },
  { file: 'EXPRESSIVE-ARTS-UPPER-PRIMARY-2.pdf', folder: 'Primary Education', subjectCodes: ['PRI-ART', 'PRI-CA', 'EXP_ARTS'], gradeLevels: [5, 6, 7], subjectNameFallback: 'Expressive Arts' },
  { file: 'TECHNOLOGY-STUDIES-UPPER-PRIMARY.pdf', folder: 'Primary Education', subjectCodes: ['PRI-TECH', 'TECH_ST'], gradeLevels: [5, 6, 7], subjectNameFallback: 'Technology Studies' },

  // ===== ECE (Baby Class=-3, Middle=-2, Reception=-1) =====
  { file: 'EARLY-CHILDHOOD-EDUCATION-Syllabi-3-to-5-Year-corrected.pdf', folder: 'Early Childhood Education', subjectCodes: ['ECE-LL', 'ECE-NUM', 'ECE-ART', 'ECE-ENV', 'ECE-RE', 'ECE-PHY'], gradeLevels: [-3, -2, -1], subjectNameFallback: 'ECE' },
];

// ==========================================
// PDF TEXT EXTRACTION
// ==========================================

async function extractPdfText(filePath: string, maxPages: number = 60): Promise<string> {
  // Use the ESM helper via child_process (pdfjs-dist is ESM-only)
  const helperPath = path.join(__dirname, 'pdf-extract-helper.mjs');
  const result = execFileSync('node', ['--no-warnings', helperPath, filePath], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024, // 10MB
    timeout: 120000, // 120s timeout
    // Capture stderr separately so pdfjs warnings don't corrupt stdout JSON
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Extract JSON from output — some pdfjs warnings may leak to stdout
  const jsonStart = result.indexOf('{');
  if (jsonStart === -1) throw new Error('No JSON output from PDF helper');
  const jsonStr = result.substring(jsonStart);
  const parsed = JSON.parse(jsonStr);
  return parsed.text || '';
}

// ==========================================
// AI EXTRACTION — topics + subtopics from text
// ==========================================

interface ExtractedTopic {
  title: string;
  description: string;
  gradeLevel: number;
  orderIndex: number;
  subtopics: {
    title: string;
    description: string;
    learningObjectives: string[];
    orderIndex: number;
    duration: number | null;
  }[];
}

async function extractTopicsWithAI(
  pdfText: string,
  subjectName: string,
  gradeLevels: number[],
  fileName: string
): Promise<ExtractedTopic[]> {
  // Truncate text to fit in context window (keep first ~12000 chars which covers most topic listings)
  const truncated = pdfText.substring(0, 15000);
  
  const gradeLabels = gradeLevels.map(g => {
    if (g <= -1) return `ECE (${g === -3 ? 'Baby Class' : g === -2 ? 'Middle Class' : 'Reception'})`;
    if (g <= 7) return `Grade ${g}`;
    return `Form ${g - 7}`;
  }).join(', ');

  const prompt = `You are extracting the Zambian curriculum syllabus structure from a PDF document.

DOCUMENT: ${fileName}
SUBJECT: ${subjectName}
LEVELS: ${gradeLabels}
GRADE LEVEL NUMBERS: ${JSON.stringify(gradeLevels)}

EXTRACTED TEXT FROM PDF:
---
${truncated}
---

TASK: Extract ALL topics and subtopics from this syllabus document. For EACH grade level, identify the topics taught.

IMPORTANT RULES:
1. Extract EVERY topic mentioned — do NOT skip any
2. Each topic must have the correct gradeLevel number from: ${JSON.stringify(gradeLevels)}
3. If the document covers multiple grade levels (forms), assign topics to the correct grade level
4. If you can't determine which grade level a topic belongs to, assign it to ALL grade levels
5. Include subtopics with learning objectives where visible in the text
6. If the PDF text is garbled/unreadable, use your knowledge of the Zambian curriculum for ${subjectName} to provide the standard topics for ${gradeLabels}
7. Order topics logically (orderIndex starting from 1)
8. Each topic should have 2-6 subtopics where applicable

Return ONLY valid JSON array (no markdown, no explanation):
[
  {
    "title": "Topic Name",
    "description": "Brief description of this topic",
    "gradeLevel": 8,
    "orderIndex": 1,
    "subtopics": [
      {
        "title": "Subtopic Name",
        "description": "What this subtopic covers",
        "learningObjectives": ["Objective 1", "Objective 2"],
        "orderIndex": 1,
        "duration": 45
      }
    ]
  }
]`;

  const response = await aiService.chat([
    { role: 'user', content: prompt },
  ], { temperature: 0.2, maxTokens: 4000 });

  // Parse JSON from response
  let jsonStr = response.content.trim();
  // Remove markdown code fences if present
  jsonStr = jsonStr.replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  
  try {
    const topics: ExtractedTopic[] = JSON.parse(jsonStr);
    return topics;
  } catch (err) {
    console.error(`  ❌ Failed to parse AI response for ${fileName}:`, (err as Error).message);
    console.error(`  Response preview: ${jsonStr.substring(0, 200)}`);
    return [];
  }
}

// ==========================================
// DATABASE SEEDING
// ==========================================

async function findSubjectId(codes: string[]): Promise<string | null> {
  for (const code of codes) {
    const subject = await prisma.subject.findFirst({ where: { code } });
    if (subject) return subject.id;
  }
  return null;
}

async function seedTopics(subjectId: string, topics: ExtractedTopic[]): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const topic of topics) {
    // Check if topic already exists for this subject + grade + title
    const existing = await prisma.topic.findFirst({
      where: {
        subjectId,
        gradeLevel: topic.gradeLevel,
        title: topic.title,
      },
    });

    if (existing) {
      skipped++;
      // Still seed subtopics if they don't exist
      if (topic.subtopics?.length) {
        await seedSubTopics(existing.id, topic.subtopics);
      }
      continue;
    }

    const newTopic = await prisma.topic.create({
      data: {
        title: topic.title,
        description: topic.description || null,
        subjectId,
        gradeLevel: topic.gradeLevel,
        orderIndex: topic.orderIndex || 0,
      },
    });
    created++;

    if (topic.subtopics?.length) {
      await seedSubTopics(newTopic.id, topic.subtopics);
    }
  }

  return { created, skipped };
}

async function seedSubTopics(topicId: string, subtopics: ExtractedTopic['subtopics']): Promise<void> {
  for (const st of subtopics) {
    const existing = await (prisma as any).subTopic.findFirst({
      where: { topicId, title: st.title },
    });

    if (existing) continue;

    await (prisma as any).subTopic.create({
      data: {
        title: st.title,
        description: st.description || null,
        learningObjectives: st.learningObjectives?.length ? JSON.stringify(st.learningObjectives) : null,
        topicId,
        orderIndex: st.orderIndex || 0,
        duration: st.duration || null,
      },
    });
  }
}

// ==========================================
// MAIN
// ==========================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   SYLLABUS PDF → DATABASE SEEDER                   ║');
  console.log('║   Zambian Curriculum Topics & Subtopics             ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log();

  const baseDir = path.join(__dirname, '..', 'Finalised Syllabi');
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalPdfs = 0;
  let failedPdfs: string[] = [];

  for (const mapping of PDF_MAPPINGS) {
    const filePath = path.join(baseDir, mapping.folder, mapping.file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${mapping.file} — skipping`);
      continue;
    }

    totalPdfs++;
    console.log(`\n📄 Processing: ${mapping.file}`);
    console.log(`   Folder: ${mapping.folder}`);
    console.log(`   Subject: ${mapping.subjectNameFallback}`);
    console.log(`   Grades: ${mapping.gradeLevels.join(', ')}`);

    // Find subject in DB
    const subjectId = await findSubjectId(mapping.subjectCodes);
    if (!subjectId) {
      console.log(`   ❌ No matching subject in DB for codes: ${mapping.subjectCodes.join(', ')}`);
      failedPdfs.push(mapping.file);
      continue;
    }
    console.log(`   ✅ Subject ID: ${subjectId}`);

    // Extract text from PDF
    console.log(`   📖 Extracting text...`);
    let pdfText: string;
    try {
      pdfText = await extractPdfText(filePath);
      console.log(`   📖 Extracted ${pdfText.length} chars of readable text`);
    } catch (err) {
      console.log(`   ❌ PDF extraction failed: ${(err as Error).message}`);
      failedPdfs.push(mapping.file);
      continue;
    }

    // AI extraction
    console.log(`   🤖 Sending to AI for topic extraction...`);
    let topics: ExtractedTopic[];
    try {
      topics = await extractTopicsWithAI(pdfText, mapping.subjectNameFallback, mapping.gradeLevels, mapping.file);
      console.log(`   🤖 AI extracted ${topics.length} topics`);
    } catch (err) {
      console.log(`   ❌ AI extraction failed: ${(err as Error).message}`);
      failedPdfs.push(mapping.file);
      continue;
    }

    if (topics.length === 0) {
      console.log(`   ⚠️  No topics extracted — skipping`);
      failedPdfs.push(mapping.file);
      continue;
    }

    // Seed into DB
    console.log(`   💾 Seeding into database...`);
    const { created, skipped } = await seedTopics(subjectId, topics);
    totalCreated += created;
    totalSkipped += skipped;
    console.log(`   💾 Created: ${created} topics, Skipped (existing): ${skipped}`);
  }

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  COMPLETE                                           ║`);
  console.log(`║  PDFs processed: ${totalPdfs.toString().padEnd(35)}║`);
  console.log(`║  Topics created: ${totalCreated.toString().padEnd(35)}║`);
  console.log(`║  Topics skipped: ${totalSkipped.toString().padEnd(35)}║`);
  if (failedPdfs.length > 0) {
    console.log(`║  Failed PDFs: ${failedPdfs.length.toString().padEnd(38)}║`);
  }
  console.log('╚══════════════════════════════════════════════════════╝');

  if (failedPdfs.length > 0) {
    console.log('\nFailed PDFs:');
    failedPdfs.forEach(f => console.log(`  - ${f}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
