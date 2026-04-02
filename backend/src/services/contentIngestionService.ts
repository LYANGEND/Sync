import * as fs from 'fs';
import * as path from 'path';
import { PDFParse } from 'pdf-parse';
import { prisma } from '../utils/prisma';

// ================================================================
// CONTENT INGESTION SERVICE
// ================================================================
// Extracts text from official Zambian CDC syllabus PDFs and
// teaching modules, then stores the content in the TeachingContent
// table so the AI Tutor can teach from verified material.

// -----------------------------------------------------------------
// FILENAME → SUBJECT + GRADE MAPPING
// -----------------------------------------------------------------
// PDF filenames follow patterns like:
//   CHEMISTRY-SYLLABUS.pdf
//   MATHEMATICS-O-LEVEL-FORMS-1-4.pdf
//   Chemistry-Teaching-Module-Form-1-final-version-3.pdf
//   1-ENGLISH-LANGUAGE-TEACHING-MODULE-FORM-1-TERM-1.pdf

interface ParsedFileInfo {
  subjectName: string;
  gradeLevel: number | null;   // 8-12 for Form 1-4 (secondary)
  term: number | null;         // 1, 2, or 3
  contentType: 'SYLLABUS' | 'MODULE';
  sourceFile: string;
}

// Map common filename keywords to standardised subject names
const SUBJECT_MAP: Record<string, string> = {
  'AGRICULTURAL': 'Agricultural Science',
  'AGRICULTURE': 'Agricultural Science',
  'ART': 'Art and Design',
  'BIOLOGY': 'Biology',
  'CHEMISTRY': 'Chemistry',
  'CIVIC': 'Civic Education',
  'COMMERCE': 'Commerce',
  'COMPUTER': 'Computer Science',
  'CTS': 'Creative and Technology Studies',
  'DESIGN-AND-TECHNOLOGY': 'Design and Technology',
  'EARLY-CHILDHOOD': 'Early Childhood Education',
  'ECE': 'Early Childhood Education',
  'ENGLISH': 'English',
  'EXPRESSIVE': 'Expressive Arts',
  'FASHION': 'Fashion and Fabrics',
  'FOOD': 'Food and Nutrition',
  'FRENCH': 'French',
  'GEOGRAPHY': 'Geography',
  'HISTORY': 'History',
  'HOSPITALITY': 'Hospitality',
  'ICT': 'ICT',
  'INTELLECTUAL': 'Special Education',
  'KIKAONDE': 'Kikaonde',
  'LITERATURE': 'Literature in English',
  'LOWER-PRIMARY': 'Lower Primary',
  'LUNDA': 'Lunda',
  'LUVALE': 'Luvale',
  'MATHEMATICS': 'Mathematics',
  'MUSIC': 'Music',
  'PHYSICAL': 'Physical Education',
  'PHYSICS': 'Physics',
  'PRE-MATHEMATICS': 'Pre-Mathematics',
  'RELIGIOUS': 'Religious Education',
  'SILOZI': 'Silozi',
  'TECHNOLOGY': 'Technology Studies',
  'TRAVEL': 'Travel and Tourism',
  'ZAMBIAN-LANGUAGES': 'Zambian Languages',
  'ZAMBIAN-SIGN': 'Zambian Sign Language',
  'CHITONGA': 'Chitonga',
  'CINYANJA': 'Cinyanja',
  'ICIBEMBA': 'Icibemba',
  'FF-FORM': 'Fashion and Fabrics',
  'LIT-IN': 'Literature',
};

// Zambian language-specific literature mapping
const LITERATURE_LANG_MAP: Record<string, string> = {
  'BEMBA': 'Literature in Icibemba',
  'ICIBEMBA': 'Literature in Icibemba',
  'CHITONGA': 'Literature in Chitonga',
  'CINYANJA': 'Literature in Cinyanja',
  'KIKAONDE': 'Literature in Kikaonde',
  'LUNDA': 'Literature in Lunda',
  'LUVALE': 'Literature in Luvale',
  'SILOZI': 'Literature in Silozi',
  'ENGLISH': 'Literature in English',
};

function parseFilename(filename: string): ParsedFileInfo {
  const upper = filename.toUpperCase().replace(/\.PDF$/i, '');
  const parts = upper.split(/[-_\s]+/);

  // Detect content type
  const isModule = upper.includes('MODULE') || upper.includes('TEACHING');
  const contentType: 'SYLLABUS' | 'MODULE' = isModule ? 'MODULE' : 'SYLLABUS';

  // Extract grade/form level
  let gradeLevel: number | null = null;
  const formMatch = upper.match(/FORM[- _]?(\d)/);
  if (formMatch) {
    gradeLevel = parseInt(formMatch[1]) + 7; // Form 1 = Grade 8
  }
  const gradeMatch = upper.match(/GRADE[- _]?(\d+)/);
  if (gradeMatch) {
    gradeLevel = parseInt(gradeMatch[1]);
  }
  if (upper.includes('ECE') || upper.includes('EARLY-CHILDHOOD')) {
    gradeLevel = 0; // ECE
  }

  // Extract term
  let term: number | null = null;
  const termMatch = upper.match(/TERM[- _]?(\d)/);
  if (termMatch) {
    term = parseInt(termMatch[1]);
  }

  // Detect subject
  let subjectName = 'General';

  // Handle literature in specific languages
  if (upper.includes('LITERATURE') || upper.includes('LIT-IN') || upper.includes('LIT_IN')) {
    for (const [key, value] of Object.entries(LITERATURE_LANG_MAP)) {
      if (upper.includes(key)) {
        subjectName = value;
        break;
      }
    }
    if (subjectName === 'General') {
      subjectName = 'Literature in English';
    }
  } else {
    // Try each subject keyword
    for (const [key, value] of Object.entries(SUBJECT_MAP)) {
      if (parts.includes(key) || upper.includes(key)) {
        subjectName = value;
        break;
      }
    }
  }

  return {
    subjectName,
    gradeLevel,
    term,
    contentType,
    sourceFile: filename,
  };
}

// -----------------------------------------------------------------
// TEXT CHUNKING
// -----------------------------------------------------------------
// Split large PDF text into meaningful chunks (~2000-4000 chars)
// to avoid overwhelming the AI context window.

interface ContentChunk {
  title: string;
  content: string;
  chunkIndex: number;
}

function chunkText(text: string, title: string, maxChunkSize: number = 3000): ContentChunk[] {
  // Clean up extracted text
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 50) {
    return [];
  }

  // If small enough, return as one chunk
  if (cleaned.length <= maxChunkSize) {
    return [{ title, content: cleaned, chunkIndex: 0 }];
  }

  // Try to split on section headings first
  const sectionPatterns = [
    /\n(?=\d+\.\s+[A-Z])/g,           // "1. INTRODUCTION"
    /\n(?=[A-Z][A-Z\s]{5,}:?\n)/g,    // "TOPIC ONE: ..."
    /\n(?=TOPIC\s+\d)/gi,             // "TOPIC 1"
    /\n(?=UNIT\s+\d)/gi,              // "UNIT 1"
    /\n(?=MODULE\s+\d)/gi,            // "MODULE 1"
    /\n(?=CHAPTER\s+\d)/gi,           // "CHAPTER 1"
    /\n(?=TERM\s+\d)/gi,              // "TERM 1"
    /\n(?=WEEK\s+\d)/gi,              // "WEEK 1"
  ];

  let sections: string[] = [cleaned];
  for (const pattern of sectionPatterns) {
    if (sections.length > 1) break;
    sections = cleaned.split(pattern).filter(s => s.trim().length > 30);
  }

  // If no good section splits, chunk by paragraph
  if (sections.length <= 1) {
    sections = [];
    const paragraphs = cleaned.split(/\n\n+/);
    let currentChunk = '';

    for (const para of paragraphs) {
      if ((currentChunk + '\n\n' + para).length > maxChunkSize && currentChunk.length > 100) {
        sections.push(currentChunk.trim());
        currentChunk = para;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para;
      }
    }
    if (currentChunk.trim().length > 30) {
      sections.push(currentChunk.trim());
    }
  }

  // Further split any chunks that are still too large
  const chunks: ContentChunk[] = [];
  let chunkIdx = 0;

  for (const section of sections) {
    if (section.length <= maxChunkSize) {
      const sectionTitle = extractSectionTitle(section);
      chunks.push({
        title: sectionTitle ? `${title} — ${sectionTitle}` : `${title} (Part ${chunkIdx + 1})`,
        content: section,
        chunkIndex: chunkIdx++,
      });
    } else {
      // Hard split on sentences
      const sentences = section.match(/[^.!?]+[.!?]+/g) || [section];
      let currentChunk = '';
      for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxChunkSize && currentChunk.length > 100) {
          chunks.push({
            title: `${title} (Part ${chunkIdx + 1})`,
            content: currentChunk.trim(),
            chunkIndex: chunkIdx++,
          });
          currentChunk = sentence;
        } else {
          currentChunk += sentence;
        }
      }
      if (currentChunk.trim().length > 30) {
        chunks.push({
          title: `${title} (Part ${chunkIdx + 1})`,
          content: currentChunk.trim(),
          chunkIndex: chunkIdx++,
        });
      }
    }
  }

  return chunks;
}

function extractSectionTitle(text: string): string | null {
  const firstLine = text.split('\n')[0].trim();
  // If the first line looks like a heading (short, mostly uppercase or starts with a number)
  if (firstLine.length < 80 && (firstLine === firstLine.toUpperCase() || /^\d+[.\s]/.test(firstLine))) {
    return firstLine.replace(/[:\-]+$/, '').trim();
  }
  return null;
}

// -----------------------------------------------------------------
// PDF EXTRACTION
// -----------------------------------------------------------------

async function extractPDFText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  // Strip null bytes and other control characters that PostgreSQL UTF-8 rejects
  return (result.text || '').replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, ' ');
}

// -----------------------------------------------------------------
// INGESTION ENGINE
// -----------------------------------------------------------------

export interface IngestionResult {
  file: string;
  subject: string;
  gradeLevel: number | null;
  term: number | null;
  contentType: string;
  chunksCreated: number;
  totalCharacters: number;
  error?: string;
}

export interface IngestionSummary {
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  totalChunks: number;
  totalCharacters: number;
  results: IngestionResult[];
}

/**
 * Find or create a subject by name.
 * Matches flexibly (case-insensitive, partial match).
 */
async function findOrCreateSubject(name: string): Promise<{ id: string; name: string }> {
  // Try exact match first
  let subject = await prisma.subject.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true },
  });

  if (subject) return subject;

  // Try partial match
  const words = name.split(/\s+/);
  if (words.length > 1) {
    subject = await prisma.subject.findFirst({
      where: { name: { contains: words[0], mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    if (subject) return subject;
  }

  // Create new subject with a code derived from the name
  const code = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

  const existing = await prisma.subject.findUnique({ where: { code } });
  if (existing) return { id: existing.id, name: existing.name };

  const created = await prisma.subject.create({
    data: { name, code },
  });
  return { id: created.id, name: created.name };
}

/**
 * Ingest a single PDF file into the TeachingContent table.
 */
async function ingestPDF(filePath: string): Promise<IngestionResult> {
  const filename = path.basename(filePath);
  // Use parent folder name for additional context (e.g., "Form 1 - 4", "Primary Education")
  const parentFolder = path.basename(path.dirname(filePath));
  const parsed = parseFilename(filename);

  // Infer grade level from parent folder if not found in filename
  if (parsed.gradeLevel === null) {
    const folderUpper = parentFolder.toUpperCase();
    if (folderUpper.includes('FORM 1') || folderUpper.includes('FORM-1')) {
      parsed.gradeLevel = 8; // Form 1 = Grade 8
    } else if (folderUpper.includes('FORM 2') || folderUpper.includes('FORM-2')) {
      parsed.gradeLevel = 9;
    } else if (folderUpper.includes('FORM 3') || folderUpper.includes('FORM-3')) {
      parsed.gradeLevel = 10;
    } else if (folderUpper.includes('FORM 4') || folderUpper.includes('FORM-4')) {
      parsed.gradeLevel = 11;
    } else if (folderUpper.includes('FORM 1 - 4') || folderUpper.includes('FORM 1-4')) {
      parsed.gradeLevel = 8; // Default to Form 1 for combined syllabi
    } else if (folderUpper.includes('PRIMARY')) {
      parsed.gradeLevel = 5; // Default primary
    } else if (folderUpper.includes('ECE') || folderUpper.includes('EARLY CHILDHOOD')) {
      parsed.gradeLevel = 0;
    }
  }

  // Detect content type from parent directories
  if (filePath.includes('Finalised Syllabi')) {
    parsed.contentType = 'SYLLABUS';
  } else if (filePath.includes('Finalised Teaching Modules') || filePath.includes('Teaching Modules')) {
    parsed.contentType = 'MODULE';
  }

  try {
    const text = await extractPDFText(filePath);

    if (!text || text.trim().length < 100) {
      return {
        file: filename,
        subject: parsed.subjectName,
        gradeLevel: parsed.gradeLevel,
        term: parsed.term,
        contentType: parsed.contentType,
        chunksCreated: 0,
        totalCharacters: 0,
        error: 'PDF text too short or empty (possible scanned image PDF)',
      };
    }

    const subject = await findOrCreateSubject(parsed.subjectName);
    const baseTitle = `${subject.name}${parsed.gradeLevel !== null ? ` Grade ${parsed.gradeLevel}` : ''}${parsed.term ? ` Term ${parsed.term}` : ''}`;
    const source = parsed.contentType === 'SYLLABUS' ? 'Zambia CDC Syllabus' : 'Zambia CDC Teaching Module';

    // Chunk the text
    const chunks = chunkText(text, baseTitle);

    if (chunks.length === 0) {
      return {
        file: filename,
        subject: subject.name,
        gradeLevel: parsed.gradeLevel,
        term: parsed.term,
        contentType: parsed.contentType,
        chunksCreated: 0,
        totalCharacters: 0,
        error: 'Could not extract meaningful content chunks',
      };
    }

    // Delete existing content from this source file to avoid duplicates
    await (prisma as any).teachingContent.deleteMany({
      where: { sourceFile: filename },
    });

    // Store each chunk
    let totalChars = 0;
    for (const chunk of chunks) {
      await (prisma as any).teachingContent.create({
        data: {
          subjectId: subject.id,
          gradeLevel: parsed.gradeLevel || 0,
          title: chunk.title,
          content: chunk.content,
          source,
          sourceFile: filename,
          contentType: parsed.contentType === 'SYLLABUS' ? 'SYLLABUS' : 'MODULE',
          approved: true,
        },
      });
      totalChars += chunk.content.length;
    }

    return {
      file: filename,
      subject: subject.name,
      gradeLevel: parsed.gradeLevel,
      term: parsed.term,
      contentType: parsed.contentType,
      chunksCreated: chunks.length,
      totalCharacters: totalChars,
    };
  } catch (err) {
    return {
      file: filename,
      subject: parsed.subjectName,
      gradeLevel: parsed.gradeLevel,
      term: parsed.term,
      contentType: parsed.contentType,
      chunksCreated: 0,
      totalCharacters: 0,
      error: (err as Error).message,
    };
  }
}

/**
 * Recursively find all PDF files in a directory.
 */
function findPDFsRecursively(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPDFsRecursively(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Resolve the project root (backend/) regardless of whether we're
 * running via ts-node (src/services/) or compiled JS (dist/src/services/).
 */
function getProjectRoot(): string {
  // __dirname in dev: <root>/src/services  → go up 2
  // __dirname in prod: <root>/dist/src/services → go up 3
  const candidate = path.resolve(__dirname, '../../');
  if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
  const candidate2 = path.resolve(__dirname, '../../../');
  if (fs.existsSync(path.join(candidate2, 'package.json'))) return candidate2;
  return candidate; // fallback
}

/**
 * Ingest a single PDF buffer directly (for upload-based ingestion).
 */
export async function ingestUploadedPDF(
  buffer: Buffer,
  filename: string
): Promise<IngestionResult> {
  // Write to a temp location, ingest, then clean up
  const tmpDir = path.join(getProjectRoot(), 'uploads', 'pdf-ingestion');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, filename);
  fs.writeFileSync(tmpPath, buffer);
  try {
    const result = await ingestPDF(tmpPath);
    return result;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

/**
 * Ingest all PDFs from the Finalised Syllabi and Teaching Modules directories.
 */
export async function ingestAllPDFs(
  options: { syllabi?: boolean; modules?: boolean } = { syllabi: true, modules: true }
): Promise<IngestionSummary> {
  const baseDir = getProjectRoot();
  const pdfFiles: string[] = [];

  if (options.syllabi !== false) {
    const syllabiDir = path.join(baseDir, 'Finalised Syllabi');
    pdfFiles.push(...findPDFsRecursively(syllabiDir));
  }

  if (options.modules !== false) {
    const modulesDir = path.join(baseDir, 'Finalised Teaching Modules');
    pdfFiles.push(...findPDFsRecursively(modulesDir));
  }

  console.log(`[ContentIngestion] Found ${pdfFiles.length} PDF files to ingest`);

  const results: IngestionResult[] = [];
  let totalChunks = 0;
  let totalChars = 0;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < pdfFiles.length; i++) {
    const filePath = pdfFiles[i];
    const filename = path.basename(filePath);
    console.log(`[ContentIngestion] [${i + 1}/${pdfFiles.length}] Processing: ${filename}`);

    const result = await ingestPDF(filePath);
    results.push(result);

    if (result.error) {
      failCount++;
      console.warn(`  ⚠ ${result.error}`);
    } else {
      successCount++;
      totalChunks += result.chunksCreated;
      totalChars += result.totalCharacters;
      console.log(`  ✓ ${result.chunksCreated} chunks, ${result.totalCharacters} chars → ${result.subject}`);
    }
  }

  console.log(`\n[ContentIngestion] Complete: ${successCount} succeeded, ${failCount} failed, ${totalChunks} total chunks`);

  return {
    totalFiles: pdfFiles.length,
    successfulFiles: successCount,
    failedFiles: failCount,
    totalChunks,
    totalCharacters: totalChars,
    results,
  };
}

/**
 * Get a summary of what's currently stored in TeachingContent.
 */
export async function getIngestionStatus(): Promise<{
  totalRecords: number;
  totalCharacters: number;
  bySubject: { subjectName: string; count: number }[];
  byContentType: { contentType: string; count: number }[];
  sourceFiles: string[];
}> {
  const totalRecords = await (prisma as any).teachingContent.count();

  const byContentType: any[] = await (prisma as any).teachingContent.groupBy({
    by: ['contentType'],
    _count: { id: true },
  });

  const records: { content: string; sourceFile: string | null; subjectId: string }[] = await (prisma as any).teachingContent.findMany({
    select: {
      content: true,
      sourceFile: true,
      subjectId: true,
    },
  });

  // Get unique subject IDs and map to names
  const subjectIds = [...new Set(records.map(r => r.subjectId))];
  const subjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true, name: true },
  });
  const subjectMap = new Map(subjects.map(s => [s.id, s.name]));

  // Count by subject
  const subjectCounts = new Map<string, number>();
  for (const r of records) {
    const name = subjectMap.get(r.subjectId) || 'Unknown';
    subjectCounts.set(name, (subjectCounts.get(name) || 0) + 1);
  }

  const sourceFiles = [...new Set(records.map(r => r.sourceFile).filter(Boolean))] as string[];
  const totalCharacters = records.reduce((sum: number, r) => sum + (r.content?.length || 0), 0);

  return {
    totalRecords,
    totalCharacters,
    bySubject: Array.from(subjectCounts.entries())
      .map(([subjectName, count]) => ({ subjectName, count }))
      .sort((a, b) => b.count - a.count),
    byContentType: byContentType.map(r => ({
      contentType: r.contentType,
      count: r._count.id,
    })),
    sourceFiles: sourceFiles.sort(),
  };
}
