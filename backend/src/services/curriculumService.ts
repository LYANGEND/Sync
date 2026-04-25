/**
 * Curriculum Reference Service
 * 
 * Indexes and provides access to official Zambian CDC curriculum PDFs
 * from "Finalised Syllabi" and "Finalised Teaching Modules" folders.
 * 
 * Used as the source of truth when generating syllabi, lesson plans, etc.
 */

import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';

// ============================================================
// TYPES
// ============================================================

interface CurriculumDocument {
  filename: string;
  filepath: string;
  type: 'syllabus' | 'teaching_module';
  subjectCode: string;
  subjectName: string;
  gradeLevel: string; // e.g. "ECE", "1-3", "1-4", "Form 1"
  gradeLevels: number[]; // numeric: [-3,-2,-1,0], [1,2,3], [8,9,10,11]
  term?: number; // 1, 2, or 3
}

interface CurriculumIndex {
  documents: CurriculumDocument[];
  lastIndexed: string;
}

interface CurriculumContent {
  document: CurriculumDocument;
  text: string;
  truncated: boolean;
}

// ============================================================
// SUBJECT NAME → CODE MAPPING (from filename patterns)
// ============================================================

const SUBJECT_NAME_TO_CODE: Record<string, string> = {
  'mathematics': 'MATH',
  'maths': 'MATH',
  'math': 'MATH',
  'mathematics-ii': 'AMATH',
  'maths2': 'AMATH',
  'english': 'ENG',
  'english-language': 'ENG',
  'literacy-in-english': 'ENG',
  'literacy': 'LITERACY',
  'pre-mathematics': 'NUMERACY',
  'pre-mathematics-science': 'NUMERACY',
  'science': 'SCI',
  'biology': 'BIO',
  'chemistry': 'CHEM',
  'physics': 'PHY',
  'history': 'HIST',
  'geography': 'GEO',
  'civic-education': 'CIVIC',
  'civic': 'CIVIC',
  'religious-education': 'RE',
  'social-studies': 'SST',
  'social': 'SOCIAL',
  'ict': 'ICT',
  'computer-science': 'ICT',
  'computer-studies': 'ICT',
  'physical-education': 'PE',
  'physical-education-and-sport': 'PE',
  'creative-and-technology-studies': 'CTS',
  'cts': 'CTS',
  'adapted-cts': 'CTS',
  'design-and-technology': 'DT',
  'design-and-technology-studies': 'DT',
  'technology-studies': 'DT',
  'art-and-design': 'ART',
  'art-an-design': 'ART',
  'expressive-arts': 'ART',
  'music': 'MUSIC',
  'music-arts': 'MUSIC',
  'musical-arts': 'MUSIC',
  'musical-arts-education': 'MUSIC',
  'food-and-nutrition': 'FN',
  'home-economics': 'HEC',
  'fashion-and-fabrics': 'FF',
  'hospitality': 'HOSP',
  'hospitality-management': 'HOSP',
  'commerce': 'COM',
  'commerce-and-principles-of-accounts': 'COM',
  'principles-of-accounts': 'ACCT',
  'agricultural-science': 'AGRI',
  'literature': 'LIT',
  'literature-in-english': 'LIT',
  'french': 'FRENCH',
  'french-language': 'FRENCH',
  'travel-and-tourism': 'TOURISM',
  'travel_and_tourism': 'TOURISM',
  'zambian-languages': 'ZAM',
  'zambian-sign-languages': 'ZAM',
  // Zambian language variants
  'chitonga': 'ZAM',
  'cinyanja': 'ZAM',
  'icibemba': 'ZAM',
  'kikaonde': 'ZAM',
  'lunda': 'ZAM',
  'luvale': 'ZAM',
  'silozi': 'ZAM',
  // Literature in Zambian languages
  'literature-in-bemba': 'ZAM',
  'literature-in-chitonga': 'ZAM',
  'literature-in-cinyanja': 'ZAM',
  'literature-in-kikaonde': 'ZAM',
  'literature-in-lunda': 'ZAM',
  'literature-in-luvale': 'ZAM',
  'literature-in-silozi': 'ZAM',
  'lit-in-icibemba': 'ZAM',
  'lit-in-kikaonde': 'ZAM',
  'lit-in-lunda': 'ZAM',
  'lit-in-luvale': 'ZAM',
  'lit-in-silozi': 'ZAM',
  // ECE specific
  'early-childhood-education': 'ECE',
  'environ': 'ENVIRON',
  'environmental': 'ENVIRON',
  'creative': 'CREATIVE',
  'psychomotor': 'PSYCH',
  'intellectual-disability': 'ECE',
  'id': 'ECE',
};

// ============================================================
// FILENAME PARSING
// ============================================================

function parseFilename(filename: string, parentFolder: string, type: 'syllabus' | 'teaching_module'): CurriculumDocument | null {
  const basename = path.basename(filename, path.extname(filename));
  const normalized = basename.toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');

  // Detect grade levels from filename and parent folder
  let gradeLevel = '';
  let gradeLevels: number[] = [];
  let term: number | undefined;

  // Check parent folder for level info
  const folderLower = parentFolder.toLowerCase();
  if (folderLower.includes('early childhood') || folderLower.includes('ece')) {
    gradeLevel = 'ECE';
    gradeLevels = [-3, -2, -1, 0];
  } else if (folderLower.includes('primary')) {
    // Check filename for more specific grade info
    const gradeMatch = normalized.match(/grade-?(\d+)(?:-(\d+))?/i);
    if (gradeMatch) {
      const start = parseInt(gradeMatch[1]);
      const end = gradeMatch[2] ? parseInt(gradeMatch[2]) : start;
      gradeLevels = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      gradeLevel = start === end ? `Grade ${start}` : `Grade ${start}-${end}`;
    } else if (normalized.includes('lower-primary') || normalized.includes('grade-1-3')) {
      gradeLevels = [1, 2, 3];
      gradeLevel = 'Grade 1-3';
    } else if (normalized.includes('upper-primary')) {
      gradeLevels = [5, 6, 7];
      gradeLevel = 'Grade 5-7';
    } else {
      gradeLevels = [1, 2, 3, 4, 5, 6, 7];
      gradeLevel = 'Grade 1-7';
    }
  } else if (folderLower.includes('form')) {
    const formMatch = folderLower.match(/form\s*(\d+)\s*-?\s*(\d+)?/i);
    if (formMatch) {
      const start = parseInt(formMatch[1]);
      const end = formMatch[2] ? parseInt(formMatch[2]) : start;
      // Forms map to grades: Form 1 = Grade 8, Form 2 = Grade 9, etc.
      gradeLevels = Array.from({ length: end - start + 1 }, (_, i) => start + i + 7);
      gradeLevel = start === end ? `Form ${start}` : `Form ${start}-${end}`;
    }
  }

  // Also check filename for form/grade overrides
  const formInFile = normalized.match(/form-?(\d+)/i);
  if (formInFile && gradeLevels.length === 0) {
    const f = parseInt(formInFile[1]);
    gradeLevels = [f + 7];
    gradeLevel = `Form ${f}`;
  }

  // Detect term
  const termMatch = normalized.match(/term-?(\d)/i);
  if (termMatch) {
    term = parseInt(termMatch[1]);
  }

  // Detect subject from filename
  let subjectCode = '';
  let subjectName = '';

  // Try matching known subject patterns (longest match first)
  const sortedKeys = Object.keys(SUBJECT_NAME_TO_CODE).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (normalized.includes(key)) {
      subjectCode = SUBJECT_NAME_TO_CODE[key];
      subjectName = key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      break;
    }
  }

  // ECE filename patterns
  if (!subjectCode && (normalized.includes('ece') || gradeLevels.some(g => g <= 0))) {
    if (normalized.includes('math') || normalized.includes('numeracy')) {
      subjectCode = 'NUMERACY';
      subjectName = 'Pre-Mathematics & Science';
    } else if (normalized.includes('literacy') || normalized.includes('english')) {
      subjectCode = 'LITERACY';
      subjectName = 'Literacy';
    } else if (normalized.includes('cts') || normalized.includes('creative-and-technology')) {
      subjectCode = 'CTS';
      subjectName = 'Creative & Technology Studies';
    } else if (normalized.includes('zsl') || normalized.includes('sign')) {
      subjectCode = 'ZAM';
      subjectName = 'Zambian Sign Language';
    } else {
      subjectCode = 'ECE';
      subjectName = 'Early Childhood Education';
    }
  }

  if (!subjectCode) return null; // Can't identify subject

  return {
    filename: path.basename(filename),
    filepath: filename,
    type,
    subjectCode,
    subjectName,
    gradeLevel,
    gradeLevels,
    term,
  };
}

// ============================================================
// CURRICULUM SERVICE
// ============================================================

const SYLLABI_DIR = path.resolve(__dirname, '../../Finalised Syllabi');
const MODULES_DIR = path.resolve(__dirname, '../../Finalised Teaching Modules');
const INDEX_PATH = path.resolve(__dirname, '../../curriculum_index.json');

// In-memory cache
let cachedIndex: CurriculumIndex | null = null;
const textCache = new Map<string, string>();

/**
 * Recursively find all PDF files in a directory
 */
function findPDFs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...findPDFs(fullPath));
    } else if (item.name.toLowerCase().endsWith('.pdf')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Build or refresh the curriculum index from PDF files on disk
 */
function buildIndex(): CurriculumIndex {
  const documents: CurriculumDocument[] = [];

  // Index syllabi
  const syllabiPDFs = findPDFs(SYLLABI_DIR);
  for (const filepath of syllabiPDFs) {
    const parentFolder = path.basename(path.dirname(filepath));
    const doc = parseFilename(filepath, parentFolder, 'syllabus');
    if (doc) documents.push(doc);
  }

  // Index teaching modules
  const modulePDFs = findPDFs(MODULES_DIR);
  for (const filepath of modulePDFs) {
    const parentFolder = path.basename(path.dirname(filepath));
    const doc = parseFilename(filepath, parentFolder, 'teaching_module');
    if (doc) documents.push(doc);
  }

  const index: CurriculumIndex = {
    documents,
    lastIndexed: new Date().toISOString(),
  };

  // Save to disk for inspection
  try {
    fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  } catch (err) {
    console.error('Failed to save curriculum index:', err);
  }

  cachedIndex = index;
  return index;
}

/**
 * Get the curriculum index (cached)
 */
function getIndex(): CurriculumIndex {
  if (cachedIndex) return cachedIndex;

  // Try loading from disk
  if (fs.existsSync(INDEX_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
      cachedIndex = data;
      return data;
    } catch {}
  }

  return buildIndex();
}

/**
 * Extract text from a PDF file (cached)
 */
async function extractPDFText(filepath: string, maxPages?: number): Promise<string> {
  const cacheKey = `${filepath}_${maxPages || 'all'}`;
  if (textCache.has(cacheKey)) return textCache.get(cacheKey)!;

  try {
    const buffer = fs.readFileSync(filepath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText({ first: maxPages || 0 });
    const text = result.text.trim();
    await parser.destroy();
    textCache.set(cacheKey, text);
    return text;
  } catch (err) {
    console.error(`Failed to parse PDF ${filepath}:`, err);
    return '';
  }
}

// ============================================================
// PUBLIC API
// ============================================================

export const curriculumService = {
  /**
   * Rebuild the index from disk
   */
  reindex(): CurriculumIndex {
    cachedIndex = null;
    textCache.clear();
    return buildIndex();
  },

  /**
   * Get all indexed documents
   */
  getDocuments(): CurriculumDocument[] {
    return getIndex().documents;
  },

  /**
   * Find curriculum documents matching a subject code and grade level
   */
  findDocuments(subjectCode: string, gradeLevel?: number): CurriculumDocument[] {
    const index = getIndex();
    const code = subjectCode.toUpperCase();
    return index.documents.filter(d => {
      if (d.subjectCode !== code) return false;
      if (gradeLevel !== undefined) {
        return d.gradeLevels.includes(gradeLevel);
      }
      return true;
    });
  },

  /**
   * Get the syllabus document for a subject + grade
   * Prefers syllabus type over teaching modules
   */
  findSyllabus(subjectCode: string, gradeLevel?: number): CurriculumDocument | null {
    const docs = this.findDocuments(subjectCode, gradeLevel);
    return docs.find(d => d.type === 'syllabus') || docs[0] || null;
  },

  /**
   * Get teaching modules for a subject + grade, optionally filtered by term
   */
  findModules(subjectCode: string, gradeLevel?: number, term?: number): CurriculumDocument[] {
    const docs = this.findDocuments(subjectCode, gradeLevel).filter(d => d.type === 'teaching_module');
    if (term) return docs.filter(d => d.term === term);
    return docs;
  },

  /**
   * Extract text content from a curriculum document
   * maxChars: limit to prevent overloading AI context
   */
  async getContent(doc: CurriculumDocument, maxChars: number = 12000): Promise<CurriculumContent> {
    const text = await extractPDFText(doc.filepath);
    const truncated = text.length > maxChars;
    return {
      document: doc,
      text: truncated ? text.substring(0, maxChars) + '\n\n[... truncated for brevity ...]' : text,
      truncated,
    };
  },

  /**
   * Get relevant curriculum context for AI prompts.
   * Returns extracted text from the most relevant syllabus + module PDFs.
   */
  async getCurriculumContext(subjectCode: string, gradeLevel: number, term?: number): Promise<string> {
    const parts: string[] = [];

    // 1. Get the syllabus document
    const syllabus = this.findSyllabus(subjectCode, gradeLevel);
    if (syllabus) {
      const content = await this.getContent(syllabus, 10000);
      parts.push(`=== OFFICIAL ZAMBIAN CDC SYLLABUS: ${syllabus.filename} ===\n${content.text}`);
    }

    // 2. Get teaching module(s) if available
    const modules = this.findModules(subjectCode, gradeLevel, term);
    for (const mod of modules.slice(0, 2)) { // Max 2 modules to avoid context overflow
      const content = await this.getContent(mod, 6000);
      parts.push(`=== TEACHING MODULE: ${mod.filename} ===\n${content.text}`);
    }

    if (parts.length === 0) {
      return ''; // No curriculum docs found for this subject+grade
    }

    return `\n\n--- OFFICIAL ZAMBIAN CDC CURRICULUM REFERENCE ---\nThe following is extracted from official Zambian Curriculum Development Centre (CDC) documents. Use this as the AUTHORITATIVE source of truth for topics, subtopics, learning outcomes, and content sequencing. Do NOT deviate from this curriculum.\n\n${parts.join('\n\n')}`;
  },

  /**
   * Get a summary of all available curriculum documents
   */
  getSummary(): { subjectCode: string; subjectName: string; syllabi: number; modules: number; grades: string }[] {
    const index = getIndex();
    const bySubject = new Map<string, { name: string; syllabi: number; modules: number; grades: Set<string> }>();

    for (const doc of index.documents) {
      if (!bySubject.has(doc.subjectCode)) {
        bySubject.set(doc.subjectCode, { name: doc.subjectName, syllabi: 0, modules: 0, grades: new Set() });
      }
      const entry = bySubject.get(doc.subjectCode)!;
      if (doc.type === 'syllabus') entry.syllabi++;
      else entry.modules++;
      entry.grades.add(doc.gradeLevel);
    }

    return Array.from(bySubject.entries()).map(([code, data]) => ({
      subjectCode: code,
      subjectName: data.name,
      syllabi: data.syllabi,
      modules: data.modules,
      grades: Array.from(data.grades).join(', '),
    }));
  },
};

export default curriculumService;
