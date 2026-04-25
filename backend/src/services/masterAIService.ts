import { prisma } from '../utils/prisma';
import aiService from './aiService';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import curriculumService from './curriculumService';

// ==========================================
// MASTER AI OPS SERVICE
// ==========================================
// An AI agent that can operate across ALL modules in the system.
// Uses function-calling: the AI decides which operation(s) to perform
// based on natural language input, then executes them via Prisma.

// ---- Tool Definitions for the AI ----
// Each tool maps to a real database operation

interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required?: boolean;
  enum?: string[];
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, any>, userId: string) => Promise<any>;
}

// ---- Execution Result ----
interface ExecutionResult {
  tool: string;
  success: boolean;
  data?: any;
  error?: string;
  summary: string;
}

interface MasterAIResponse {
  message: string;
  actions: ExecutionResult[];
  suggestions?: string[];
}

// ==========================
// CONSTANTS & GUARDS
// ==========================
const MAX_ACTIONS_PER_REQUEST = 12;
const TOOL_TIMEOUT_MS = 60_000; // 60s per tool
const TOOL_TIMEOUT_LONG_MS = 120_000; // 120s for AI-generation tools
const LONG_RUNNING_TOOLS = new Set(['generate_syllabus']);

// ==========================
// BACKGROUND JOB: Bulk syllabus generation progress tracker
// ==========================
interface BulkSyllabusJob {
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  total: number;
  completed: number;
  skipped: number;
  failed: number;
  totalTopics: number;
  totalSubtopics: number;
  current?: string; // e.g. "Mathematics Grade 3"
  errors: string[];
  successes: string[];
}
const bulkSyllabusJobs: Map<string, BulkSyllabusJob> = new Map();
// Keep only last 5 jobs
function cleanOldJobs() {
  if (bulkSyllabusJobs.size > 5) {
    const keys = [...bulkSyllabusJobs.keys()];
    for (let i = 0; i < keys.length - 5; i++) bulkSyllabusJobs.delete(keys[i]);
  }
}

// ==========================
// ZAMBIAN CURRICULUM: Subject ↔ Grade Level Mapping
// ==========================
// Defines which subjects are appropriate for which grade ranges.
// Based on the Zambian CDC (Curriculum Development Centre) framework.
// Code keys are matched case-insensitively against subject.code.
// If a subject code is not in this map, it's allowed at all grades (fallback).
const SUBJECT_GRADE_RANGES: Record<string, { min: number; max: number }> = {
  // ECE learning areas (Baby Class → Reception): -3 to 0
  ECE:       { min: -3, max: 0 },
  LITERACY:  { min: -3, max: 0 },
  NUMERACY:  { min: -3, max: 0 },
  ENVIRON:   { min: -3, max: 0 },
  SOCIAL:    { min: -3, max: 0 },
  CREATIVE:  { min: -3, max: 0 },
  PSYCH:     { min: -3, max: 0 },

  // Primary + Secondary core
  MATH:  { min: 1, max: 12 },
  ENG:   { min: 1, max: 12 },
  SCI:   { min: 1, max: 7 },   // General Science (primary only)
  SST:   { min: 1, max: 9 },   // Social Studies (primary + junior secondary)
  PE:    { min: 1, max: 12 },
  RE:    { min: 1, max: 12 },  // Religious Education
  ZAM:   { min: 1, max: 12 },  // Zambian Languages

  // Primary specific
  CTS:   { min: 1, max: 4 },   // Creative & Technology Studies (lower primary)
  EA:    { min: 5, max: 7 },   // Expressive Arts (upper primary)

  // Primary + Junior Secondary
  ICT:   { min: 3, max: 12 },  // ICT / Computer Science
  HEC:   { min: 5, max: 9 },   // Home Economics (upper primary + junior sec)

  // Secondary (Form 1-4 / Grade 8-12)
  ISCI:    { min: 8, max: 9 },   // Integrated Science (junior secondary)
  BIO:     { min: 8, max: 12 },
  CHEM:    { min: 8, max: 12 },
  PHY:     { min: 8, max: 12 },
  AMATH:   { min: 10, max: 12 }, // Additional Mathematics
  HIST:    { min: 8, max: 12 },
  GEO:     { min: 8, max: 12 },
  CIVIC:   { min: 8, max: 12 },  // Civic Education
  LIT:     { min: 8, max: 12 },  // Literature in English
  ART:     { min: 8, max: 12 },  // Art and Design
  MUSIC:   { min: 8, max: 12 },  // Musical Arts Education
  DT:      { min: 8, max: 12 },  // Design and Technology
  COM:     { min: 8, max: 12 },  // Commerce
  ACCT:    { min: 8, max: 12 },  // Principles of Accounts
  BSTUD:   { min: 8, max: 12 },  // Business Studies
  AGRI:    { min: 8, max: 12 },  // Agricultural Science
  FN:      { min: 8, max: 12 },  // Food and Nutrition
  FF:      { min: 8, max: 12 },  // Fashion and Fabrics
  FRENCH:  { min: 8, max: 12 },  // French Language
  HOSP:    { min: 8, max: 12 },  // Hospitality Management
  TOURISM: { min: 8, max: 12 },  // Travel and Tourism
};

/**
 * Check if a subject (by code) is appropriate for a given grade level.
 * Returns true if allowed, false if the subject shouldn't exist at that grade.
 * Unknown subject codes are allowed at all levels (permissive fallback).
 */
function isSubjectValidForGrade(subjectCode: string, gradeLevel: number): boolean {
  const range = SUBJECT_GRADE_RANGES[subjectCode.toUpperCase()];
  if (!range) return true; // Unknown code → allow (permissive)
  return gradeLevel >= range.min && gradeLevel <= range.max;
}

/**
 * Get the valid grade range for a subject code.
 * Returns null if unknown (meaning all grades are allowed).
 */
function getSubjectGradeRange(subjectCode: string): { min: number; max: number } | null {
  return SUBJECT_GRADE_RANGES[subjectCode.toUpperCase()] || null;
}

// ==========================
// UTILITY: Timeout wrapper
// ==========================
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool "${label}" timed out after ${Math.round(ms / 1000)}s`)), ms)
    ),
  ]);
}

// ==========================
// UTILITY: Validate tool params with Zod
// ==========================
const toolParamSchemas: Record<string, z.ZodSchema> = {
  add_calendar_events: z.object({
    events: z.array(z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      eventType: z.enum(['HOLIDAY', 'EXAM_PERIOD', 'PARENT_MEETING', 'SPORTS_DAY', 'CULTURAL_EVENT', 'DEADLINE', 'STAFF_DEVELOPMENT', 'SCHOOL_CLOSURE', 'OTHER']).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      color: z.string().max(20).optional(),
    })).min(1).max(100),
  }),
  create_students: z.object({
    students: z.array(z.object({
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      admissionNumber: z.string().min(1).max(50),
      gender: z.enum(['MALE', 'FEMALE']).optional(),
      dateOfBirth: z.string().optional(),
      classId: z.string().optional(),
      guardianName: z.string().max(200).optional(),
      guardianPhone: z.string().max(30).optional(),
      address: z.string().max(500).optional(),
    })).min(1).max(200),
  }),
  create_classes: z.object({
    classes: z.array(z.object({
      name: z.string().min(1).max(100),
      gradeLevel: z.number().int().min(-3).max(12).optional(),
      teacherId: z.string().optional(),
      academicTermId: z.string().optional(),
    })).min(1).max(50),
  }),
  create_subjects: z.object({
    subjects: z.array(z.object({
      name: z.string().min(1).max(100),
      code: z.string().min(1).max(20),
    })).min(1).max(50),
  }),
  generate_syllabus: z.object({
    subjectId: z.string().optional(),
    subjectCode: z.string().max(20).optional(),
    gradeLevel: z.number().int().min(-3).max(12),
  }),
  populate_all_syllabi: z.object({
    gradeLevels: z.array(z.number().int().min(-3).max(12)).max(16).optional(),
    subjectCodes: z.array(z.string().max(20)).max(30).optional(),
  }),
  create_topics: z.object({
    subjectId: z.string().optional(),
    subjectCode: z.string().max(20).optional(),
    gradeLevel: z.number().int().min(-3).max(12),
    topics: z.array(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      orderIndex: z.number().optional(),
      subtopics: z.array(z.any()).optional(),
    })).min(1).max(50),
  }),
  delete_topics: z.object({
    subjectId: z.string().optional(),
    subjectCode: z.string().max(20).optional(),
    gradeLevel: z.number().int().min(-3).max(12),
  }),
  create_fee_templates: z.object({
    templates: z.array(z.object({
      name: z.string().min(1).max(200),
      amount: z.number().positive(),
      academicTermId: z.string().optional(),
      applicableGrade: z.number().optional(),
    })).min(1).max(50),
  }),
  create_academic_terms: z.object({
    terms: z.array(z.object({
      name: z.string().min(1).max(200),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      isActive: z.boolean().optional(),
    })).min(1).max(10),
  }),
  create_announcements: z.object({
    announcements: z.array(z.object({
      subject: z.string().min(1).max(200).optional(),
      title: z.string().min(1).max(200).optional(),
      message: z.string().min(1).max(5000).optional(),
      content: z.string().min(1).max(5000).optional(),
      targetRoles: z.array(z.string()).optional(),
    })).min(1).max(20),
  }),
  create_expenses: z.object({
    expenses: z.array(z.object({
      description: z.string().min(1).max(500),
      amount: z.number().positive(),
      category: z.enum(['SUPPLIES', 'MAINTENANCE', 'UTILITIES', 'TRANSPORT', 'SALARIES', 'OTHER']).optional(),
      date: z.string().optional(),
    })).min(1).max(100),
  }),
};

function validateToolParams(toolName: string, params: Record<string, any>): { valid: boolean; error?: string; sanitized: Record<string, any> } {
  const schema = toolParamSchemas[toolName];
  if (!schema) {
    // No schema defined — allow passthrough (read-only tools are safe)
    return { valid: true, sanitized: params };
  }
  try {
    const sanitized = schema.parse(params);
    return { valid: true, sanitized };
  } catch (err: any) {
    const issues = err.issues?.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; ') || err.message;
    return { valid: false, error: `Invalid parameters: ${issues}`, sanitized: params };
  }
}

// ==========================
// UTILITY: Sanitize conversation history (strip PII/data from assistant messages)
// ==========================
function sanitizeConversationHistory(history: { role: string; content: string }[], maxMessages = 8): { role: string; content: string }[] {
  return history.slice(-maxMessages).map(msg => {
    if (msg.role === 'assistant') {
      // Truncate long assistant messages — they may contain tool output data with PII
      const content = msg.content.length > 300 ? msg.content.substring(0, 300) + '...' : msg.content;
      return { role: msg.role, content };
    }
    return msg;
  });
}

// ==========================
// UTILITY: Cached system prompt (avoid rebuilding every request)
// ==========================
let _cachedSystemPrompt: string | null = null;
let _cachedToolDescriptions: string | null = null;
let _cacheBuiltAt = 0;
const PROMPT_CACHE_TTL = 60_000; // 1 minute

function getCachedSystemPrompt(): string {
  const now = Date.now();
  if (_cachedSystemPrompt && now - _cacheBuiltAt < PROMPT_CACHE_TTL) {
    return _cachedSystemPrompt;
  }
  _cachedToolDescriptions = buildToolDescriptions();
  _cachedSystemPrompt = buildSystemPrompt();
  _cacheBuiltAt = now;
  return _cachedSystemPrompt;
}

// ==========================
// TOOL REGISTRY
// ==========================
const tools: ToolDefinition[] = [

  // ===================== ACADEMIC CALENDAR =====================
  {
    name: 'add_calendar_events',
    description: 'Add one or more events (holidays, exam periods, parent meetings, sports days, closures, etc.) to the academic calendar. Use this for bulk-adding holidays by country, creating exam schedules, or any calendar entry.',
    parameters: [
      { name: 'events', type: 'array', description: 'Array of event objects with: title (string), description (string, optional), eventType (HOLIDAY|EXAM_PERIOD|PARENT_MEETING|SPORTS_DAY|CULTURAL_EVENT|DEADLINE|STAFF_DEVELOPMENT|SCHOOL_CLOSURE|OTHER), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), color (hex string, optional)', required: true },
    ],
    execute: async (params, userId) => {
      const events = params.events as any[];
      const created = [];
      const errors: string[] = [];
      for (const ev of events) {
        try {
          const event = await prisma.academicEvent.create({
            data: {
              title: ev.title,
              description: ev.description || null,
              eventType: ev.eventType || 'HOLIDAY',
              startDate: new Date(ev.startDate),
              endDate: new Date(ev.endDate),
              isAllDay: ev.isAllDay ?? true,
              color: ev.color || null,
              createdBy: userId,
            },
          });
          created.push(event);
        } catch (err: any) {
          errors.push(`Event "${ev.title}": ${err.message?.split('\n').pop()}`);
        }
      }
      return { created, errors, summary: `${created.length} created, ${errors.length} failed` };
    },
  },

  {
    name: 'list_calendar_events',
    description: 'List academic calendar events, optionally filtered by date range or event type.',
    parameters: [
      { name: 'startDate', type: 'string', description: 'Filter from date (YYYY-MM-DD)' },
      { name: 'endDate', type: 'string', description: 'Filter to date (YYYY-MM-DD)' },
      { name: 'eventType', type: 'string', description: 'Filter by type', enum: ['HOLIDAY', 'EXAM_PERIOD', 'PARENT_MEETING', 'SPORTS_DAY', 'CULTURAL_EVENT', 'DEADLINE', 'STAFF_DEVELOPMENT', 'SCHOOL_CLOSURE', 'OTHER'] },
    ],
    execute: async (params) => {
      const where: any = {};
      if (params.startDate && params.endDate) {
        where.startDate = { gte: new Date(params.startDate) };
        where.endDate = { lte: new Date(params.endDate) };
      }
      if (params.eventType) where.eventType = params.eventType;
      return prisma.academicEvent.findMany({ where, orderBy: { startDate: 'asc' }, take: 50 });
    },
  },

  {
    name: 'delete_calendar_events',
    description: 'Delete calendar events by their IDs or by matching title/type.',
    parameters: [
      { name: 'ids', type: 'array', description: 'Array of event IDs to delete' },
      { name: 'eventType', type: 'string', description: 'Delete all events of this type' },
    ],
    execute: async (params) => {
      if (params.ids?.length) {
        const result = await prisma.academicEvent.deleteMany({ where: { id: { in: params.ids } } });
        return { deleted: result.count };
      }
      if (params.eventType) {
        const result = await prisma.academicEvent.deleteMany({ where: { eventType: params.eventType } });
        return { deleted: result.count };
      }
      return { deleted: 0 };
    },
  },

  // ===================== STUDENTS =====================
  {
    name: 'create_students',
    description: 'Create one or more students. Can be used to bulk-enroll students.',
    parameters: [
      { name: 'students', type: 'array', description: 'Array of student objects: firstName, lastName, admissionNumber, gender (MALE/FEMALE), dateOfBirth (YYYY-MM-DD), classId, guardianName, guardianPhone, address (optional)', required: true },
    ],
    execute: async (params) => {
      const students = params.students as any[];
      const created = [];
      const updated = [];
      const errors: string[] = [];
      for (const s of students) {
        try {
          const student = await prisma.student.upsert({
            where: { admissionNumber: s.admissionNumber },
            update: {
              firstName: s.firstName,
              lastName: s.lastName,
              gender: s.gender || undefined,
              dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth) : undefined,
              classId: s.classId || undefined,
              guardianName: s.guardianName || undefined,
              guardianPhone: s.guardianPhone || undefined,
              address: s.address || undefined,
            },
            create: {
              firstName: s.firstName,
              lastName: s.lastName,
              admissionNumber: s.admissionNumber,
              gender: s.gender || 'MALE',
              dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth) : new Date('2010-01-01'),
              classId: s.classId,
              guardianName: s.guardianName || null,
              guardianPhone: s.guardianPhone || null,
              address: s.address || null,
            },
          });
          // Check if it was an update by seeing if createdAt < updatedAt
          if (student.createdAt.getTime() < student.updatedAt.getTime() - 1000) {
            updated.push(student);
          } else {
            created.push(student);
          }
        } catch (err: any) {
          errors.push(`Student "${s.firstName} ${s.lastName}" (${s.admissionNumber}): ${err.message?.split('\n').pop()}`);
        }
      }
      return { created, updated, errors, summary: `${created.length} created, ${updated.length} updated, ${errors.length} failed` };
    },
  },

  {
    name: 'search_students',
    description: 'Search for students by name, admission number, or class.',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query (name or admission number)' },
      { name: 'classId', type: 'string', description: 'Filter by class ID' },
      { name: 'status', type: 'string', description: 'Filter by status', enum: ['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'DROPPED_OUT', 'ARCHIVED'] },
    ],
    execute: async (params) => {
      const where: any = {};
      if (params.query) {
        where.OR = [
          { firstName: { contains: params.query, mode: 'insensitive' } },
          { lastName: { contains: params.query, mode: 'insensitive' } },
          { admissionNumber: { contains: params.query, mode: 'insensitive' } },
        ];
      }
      if (params.classId) where.classId = params.classId;
      if (params.status) where.status = params.status;
      return prisma.student.findMany({
        where,
        include: { class: { select: { name: true } } },
        take: 20,
        orderBy: { firstName: 'asc' },
      });
    },
  },

  // ===================== CLASSES =====================
  {
    name: 'create_classes',
    description: 'Create one or more classes/grades. Requires a valid teacherId (TEACHER role user) and academicTermId. Use list_users to find teacher IDs (role: TEACHER) and list_academic_terms to find term IDs first. If not provided, will auto-assign to first available teacher and active term.',
    parameters: [
      { name: 'classes', type: 'array', description: 'Array of class objects: name, gradeLevel (number), teacherId (string), academicTermId (string)', required: true },
    ],
    execute: async (params) => {
      const classes = params.classes as any[];
      // If no teacherId/academicTermId provided, try to find defaults
      let defaultTeacherId = params.classes?.[0]?.teacherId;
      let defaultTermId = params.classes?.[0]?.academicTermId;
      if (!defaultTeacherId) {
        // Look for an active teacher first, then fall back to any teacher
        const teacher = await prisma.user.findFirst({ 
          where: { role: 'TEACHER', isActive: true },
          orderBy: { createdAt: 'asc' }
        });
        if (!teacher) {
          // If no active teacher, try any teacher
          const anyTeacher = await prisma.user.findFirst({ 
            where: { role: 'TEACHER' },
            orderBy: { createdAt: 'asc' }
          });
          defaultTeacherId = anyTeacher?.id;
        } else {
          defaultTeacherId = teacher.id;
        }
      }
      if (!defaultTermId) {
        const term = await prisma.academicTerm.findFirst({ where: { isActive: true } });
        if (!term) {
          const anyTerm = await prisma.academicTerm.findFirst({ orderBy: { startDate: 'desc' } });
          defaultTermId = anyTerm?.id;
        } else {
          defaultTermId = term.id;
        }
      }
      
      // Validate that we have required IDs before attempting to create classes
      if (!defaultTeacherId) {
        return {
          success: false,
          message: '❌ No teacher found in the system. Please create at least one teacher user before creating classes.',
          data: { created: [], existing: [], errors: ['No teacher available. Create a teacher user first using create_users with role: TEACHER'] }
        };
      }
      if (!defaultTermId) {
        return {
          success: false,
          message: '❌ No academic term found in the system. Please create at least one academic term before creating classes.',
          data: { created: [], existing: [], errors: ['No academic term available. Create an academic term first using create_academic_terms'] }
        };
      }
      
      const created = [];
      const existing = [];
      const errors: string[] = [];
      for (const c of classes) {
        try {
          // Check if a class with this name already exists
          const existingClass = await prisma.class.findFirst({ where: { name: c.name } });
          if (existingClass) {
            existing.push(existingClass);
            continue;
          }
          const cls = await prisma.class.create({
            data: {
              name: c.name,
              gradeLevel: c.gradeLevel || 1,
              teacherId: c.teacherId || defaultTeacherId,
              academicTermId: c.academicTermId || defaultTermId,
            },
          });
          created.push(cls);
        } catch (err: any) {
          errors.push(`Class "${c.name}": ${err.message?.split('\n').pop()}`);
        }
      }
      return { created, existing, errors, summary: `${created.length} created, ${existing.length} already existed, ${errors.length} failed` };
    },
  },

  {
    name: 'list_classes',
    description: 'List all classes with student counts.',
    parameters: [],
    execute: async () => {
      return prisma.class.findMany({
        include: { _count: { select: { students: true } } },
        orderBy: { gradeLevel: 'asc' },
      });
    },
  },

  // ===================== SUBJECTS =====================
  {
    name: 'create_subjects',
    description: 'Create one or more subjects.',
    parameters: [
      { name: 'subjects', type: 'array', description: 'Array of subject objects: name, code (unique short code)', required: true },
    ],
    execute: async (params) => {
      const subjects = params.subjects as any[];
      const created = [];
      const updated = [];
      const errors: string[] = [];
      for (const s of subjects) {
        try {
          const subj = await prisma.subject.upsert({
            where: { code: s.code },
            update: { name: s.name },
            create: { name: s.name, code: s.code },
          });
          // Check if it was an update
          if (subj.createdAt.getTime() < subj.updatedAt.getTime() - 1000) {
            updated.push(subj);
          } else {
            created.push(subj);
          }
        } catch (err: any) {
          errors.push(`Subject "${s.name}" (${s.code}): ${err.message?.split('\n').pop()}`);
        }
      }
      return { created, updated, errors, summary: `${created.length} created, ${updated.length} updated, ${errors.length} failed` };
    },
  },

  {
    name: 'list_subjects',
    description: 'List all subjects.',
    parameters: [],
    execute: async () => {
      return prisma.subject.findMany({ orderBy: { name: 'asc' } });
    },
  },

  // ===================== SUBJECT–CLASS ASSIGNMENTS =====================
  {
    name: 'assign_subjects_to_classes',
    description: 'Assign (connect) subjects to classes following the Zambian 2023 curriculum. Automatically filters subjects appropriate for each class grade level (e.g. Biology only for Grade 8+, ECE subjects only for ECE classes). Supports: (1) assignAll=true to auto-assign curriculum-appropriate subjects to ALL classes, (2) specific className + subjectCodes assignments. Do NOT call list_classes or list_subjects first.',
    parameters: [
      { name: 'assignAll', type: 'string', description: 'Set to "true" to assign curriculum-appropriate subjects to ALL classes automatically. No other params needed.', enum: ['true', 'false'] },
      { name: 'assignments', type: 'array', description: 'Array of { className (string, optional), classId (string, optional), subjectCodes (string[], optional), subjectIds (string[], optional) }. Each entry connects the specified subjects to the class. Ignored if assignAll=true.' },
    ],
    execute: async (params) => {
      const connected: string[] = [];
      const alreadyLinked: string[] = [];
      const skippedCurriculum: string[] = [];
      const errors: string[] = [];

      let assignments: any[] = params.assignments || [];

      // Auto-resolve mode: assign curriculum-appropriate subjects to all classes
      if (params.assignAll === 'true' || assignments.length === 0) {
        const allClasses = await prisma.class.findMany({ select: { id: true, name: true, gradeLevel: true }, orderBy: { gradeLevel: 'asc' } });
        const allSubjects = await prisma.subject.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } });
        if (allClasses.length === 0) return { error: 'No classes found. Create classes first.' };
        if (allSubjects.length === 0) return { error: 'No subjects found. Create subjects first.' };

        // Filter subjects per class based on Zambian curriculum grade ranges
        assignments = allClasses.map(c => {
          const validSubjects = allSubjects.filter(s => isSubjectValidForGrade(s.code, c.gradeLevel));
          const invalidSubjects = allSubjects.filter(s => !isSubjectValidForGrade(s.code, c.gradeLevel));
          if (invalidSubjects.length > 0) {
            skippedCurriculum.push(`${c.name} (Gr${c.gradeLevel}): skipped ${invalidSubjects.map(s => s.code).join(', ')}`);
          }
          return { classId: c.id, className: c.name, subjectIds: validSubjects.map(s => s.id) };
        });
      }

      for (const a of assignments) {
        try {
          // Resolve class
          let cls: any = null;
          if (a.classId) {
            cls = await prisma.class.findUnique({ where: { id: a.classId } });
          } else if (a.className) {
            cls = await prisma.class.findFirst({ where: { name: { equals: a.className, mode: 'insensitive' } } });
          }
          if (!cls) { errors.push(`Class "${a.className || a.classId}" not found`); continue; }

          // Resolve subjects
          const subjectIds: string[] = [];
          if (a.subjectIds?.length) {
            subjectIds.push(...a.subjectIds);
          }
          if (a.subjectCodes?.length) {
            for (const code of a.subjectCodes) {
              const sub = await prisma.subject.findFirst({ where: { code: { equals: code, mode: 'insensitive' } } });
              if (!sub) { errors.push(`Subject code "${code}" not found`); continue; }
              // Validate against Zambian curriculum
              if (!isSubjectValidForGrade(sub.code, cls.gradeLevel)) {
                skippedCurriculum.push(`${cls.name}: ${sub.code} not in curriculum for Grade ${cls.gradeLevel}`);
                continue;
              }
              subjectIds.push(sub.id);
            }
          }

          // Get already-linked subject IDs for this class
          const existing = await prisma.class.findUnique({ where: { id: cls.id }, select: { subjects: { select: { id: true } } } });
          const existingIds = new Set((existing?.subjects || []).map((s: any) => s.id));

          const toConnect = subjectIds.filter(id => !existingIds.has(id));
          const alreadyIds = subjectIds.filter(id => existingIds.has(id));

          if (toConnect.length > 0) {
            await prisma.class.update({
              where: { id: cls.id },
              data: { subjects: { connect: toConnect.map(id => ({ id })) } },
            });
            connected.push(`${cls.name}: ${toConnect.length} subject(s) connected`);
          }
          if (alreadyIds.length > 0) {
            alreadyLinked.push(`${cls.name}: ${alreadyIds.length} already assigned`);
          }
        } catch (err: any) {
          errors.push(`Assignment error: ${err.message?.split('\n').pop()}`);
        }
      }
      return { connected, alreadyLinked, skippedCurriculum, errors, summary: `${connected.length} class(es) updated, ${alreadyLinked.length} already linked, ${skippedCurriculum.length} skipped (wrong grade for curriculum), ${errors.length} issues` };
    },
  },

  {
    name: 'cleanup_class_subjects',
    description: 'Remove subjects from classes where the subject does not belong per the Zambian 2023 curriculum (e.g. Biology assigned to Grade 2, ECE subjects on Grade 10). Use dryRun=true to preview, dryRun=false to actually remove.',
    parameters: [
      { name: 'dryRun', type: 'string', description: 'Set to "true" to preview only, "false" to remove. Default: true.', enum: ['true', 'false'] },
    ],
    execute: async (params) => {
      const dryRun = params.dryRun !== 'false';
      const allClasses = await prisma.class.findMany({
        select: { id: true, name: true, gradeLevel: true, subjects: { select: { id: true, name: true, code: true } } },
        orderBy: { gradeLevel: 'asc' },
      });

      const invalidAssignments: string[] = [];
      const removed: string[] = [];

      for (const cls of allClasses) {
        const invalidSubjects = cls.subjects.filter(s => !isSubjectValidForGrade(s.code, cls.gradeLevel));
        if (invalidSubjects.length === 0) continue;

        invalidAssignments.push(`${cls.name} (Gr${cls.gradeLevel}): ${invalidSubjects.map(s => s.code).join(', ')}`);

        if (!dryRun) {
          await prisma.class.update({
            where: { id: cls.id },
            data: { subjects: { disconnect: invalidSubjects.map(s => ({ id: s.id })) } },
          });
          removed.push(`${cls.name}: removed ${invalidSubjects.length} subject(s)`);
        }
      }

      if (invalidAssignments.length === 0) {
        return { summary: 'All class-subject assignments are correct per the Zambian curriculum. No changes needed.' };
      }

      return {
        dryRun,
        invalidAssignments,
        removed,
        summary: dryRun
          ? `Found ${invalidAssignments.length} classes with incorrect subjects. Run with dryRun=false to fix.`
          : `Fixed ${removed.length} classes — removed subjects that don't belong at their grade level.`,
      };
    },
  },

  // ===================== SYLLABUS / TOPICS =====================
  {
    name: 'list_topics',
    description: 'List topics (and subtopic counts) for a subject and optional grade level. Use this to check what syllabus content exists before generating.',
    parameters: [
      { name: 'subjectId', type: 'string', description: 'Subject ID' },
      { name: 'subjectCode', type: 'string', description: 'Subject code (e.g. MATH, ENG)' },
      { name: 'gradeLevel', type: 'number', description: 'Grade level (e.g. 1-12, or -3 to 0 for ECE)' },
    ],
    execute: async (params) => {
      let subjectId = params.subjectId;
      if (!subjectId && params.subjectCode) {
        const sub = await prisma.subject.findFirst({ where: { code: { equals: params.subjectCode, mode: 'insensitive' } } });
        if (!sub) return { error: `Subject with code "${params.subjectCode}" not found` };
        subjectId = sub.id;
      }
      if (!subjectId) return { error: 'Please provide subjectId or subjectCode' };

      const where: any = { subjectId };
      if (params.gradeLevel !== undefined) where.gradeLevel = Number(params.gradeLevel);

      const topics = await prisma.topic.findMany({
        where,
        orderBy: [{ gradeLevel: 'asc' }, { orderIndex: 'asc' }],
        include: {
          subject: { select: { name: true, code: true } },
          _count: { select: { subtopics: true } },
        },
        take: 100,
      });

      return topics.map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        gradeLevel: t.gradeLevel,
        orderIndex: t.orderIndex,
        subject: `${t.subject.name} (${t.subject.code})`,
        subtopicCount: t._count.subtopics,
      }));
    },
  },

  {
    name: 'generate_syllabus',
    description: 'AI-generate a complete syllabus (topics + subtopics) for a subject at a specific grade level, following the Zambian CDC curriculum. This calls AI to create 6-12 topics with 2-5 subtopics each. Use list_topics first to check if topics already exist.',
    parameters: [
      { name: 'subjectId', type: 'string', description: 'Subject ID' },
      { name: 'subjectCode', type: 'string', description: 'Subject code (e.g. MATH, ENG). Used to look up the subject if subjectId not provided.' },
      { name: 'gradeLevel', type: 'number', description: 'Grade level (e.g. 1-12 for primary/secondary, -3 to 0 for ECE)', required: true },
    ],
    execute: async (params) => {
      let subjectId = params.subjectId;
      let subjectInfo: any = null;

      if (subjectId) {
        subjectInfo = await prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true, code: true } });
      } else if (params.subjectCode) {
        subjectInfo = await prisma.subject.findFirst({ where: { code: { equals: params.subjectCode, mode: 'insensitive' } }, select: { id: true, name: true, code: true } });
      }
      if (!subjectInfo) return { error: `Subject not found. Use list_subjects to find valid subjects.` };
      subjectId = subjectInfo.id;

      const gl = Number(params.gradeLevel);

      // Validate subject is appropriate for this grade level
      if (!isSubjectValidForGrade(subjectInfo.code, gl)) {
        const range = getSubjectGradeRange(subjectInfo.code);
        return { error: `${subjectInfo.name} (${subjectInfo.code}) is not part of the Zambian curriculum for grade ${gl}. It's taught from grade ${range?.min} to ${range?.max}.` };
      }

      // Check if topics already exist
      const existingCount = await prisma.topic.count({ where: { subjectId, gradeLevel: gl } });
      if (existingCount > 0) {
        return { error: `${subjectInfo.name} already has ${existingCount} topics at grade level ${gl}. Use delete_topics first to regenerate.` };
      }

      // Determine level description
      let levelDesc = '';
      if (gl <= -1) levelDesc = `Early Childhood Education (ECE), age ${gl + 6} years`;
      else if (gl === 0) levelDesc = `Early Childhood Education (ECE), reception/pre-school, age 5-6 years`;
      else if (gl <= 4) levelDesc = `Lower Primary, Grade ${gl} (age ${gl + 5}-${gl + 6} years)`;
      else if (gl <= 7) levelDesc = `Upper Primary, Grade ${gl} (age ${gl + 5}-${gl + 6} years)`;
      else levelDesc = `Secondary, Form ${gl - 7} / Grade ${gl} (age ${gl + 5}-${gl + 6} years)`;

      // Fetch official CDC curriculum content if available
      let curriculumRef = '';
      try {
        curriculumRef = await curriculumService.getCurriculumContext(subjectInfo.code, gl);
      } catch (e) { /* ignore – proceed without */ }

      const prompt = `You are a Zambian curriculum expert. Generate a comprehensive syllabus for:

SUBJECT: ${subjectInfo.name} (${subjectInfo.code})
LEVEL: ${levelDesc}
COUNTRY: Zambia

${curriculumRef ? `=== OFFICIAL CDC CURRICULUM REFERENCE ===
Use the following OFFICIAL Zambian CDC (Curriculum Development Centre) document as your PRIMARY source of truth. Extract topics, subtopics, learning objectives and durations directly from this content. Do NOT invent topics that are not in this document.

${curriculumRef}
=== END OFFICIAL REFERENCE ===

` : ''}Generate topics and subtopics following the official Zambian curriculum framework (CDC — Curriculum Development Centre).
${gl <= 0 ? 'For ECE, focus on age-appropriate learning activities, play-based learning, and developmental milestones.' : ''}
${gl <= 4 ? 'For lower primary, focus on foundational skills with concrete, hands-on activities.' : ''}

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "topics": [
    {
      "title": "Topic title",
      "description": "Brief description of the topic",
      "orderIndex": 1,
      "subtopics": [
        {
          "title": "Subtopic title",
          "description": "Brief description",
          "learningObjectives": ["Objective 1", "Objective 2"],
          "duration": 40,
          "orderIndex": 1
        }
      ]
    }
  ]
}

Requirements:
- Generate 6-12 topics with 2-5 subtopics each
- Topics should be in logical teaching order for Zambian schools
- Learning objectives should be specific and measurable
- Duration in minutes (30-80 depending on level, ECE: 20-30 min)
- Include Zambian context (local examples, cultural relevance)
- Cover the full scope of the subject for this grade level across all 3 terms
- Return ONLY the JSON, no other text`;

      const aiResponse = await aiService.chat([{ role: 'user', content: prompt }], { temperature: 0.4, maxTokens: 4000 });

      // Parse AI response
      let syllabusData: any;
      try {
        const content = aiResponse.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        syllabusData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
      } catch {
        return { error: 'Failed to parse AI-generated syllabus. Try again.' };
      }

      if (!syllabusData?.topics || !Array.isArray(syllabusData.topics)) {
        return { error: 'AI returned an invalid structure. Try again.' };
      }

      // Save to database
      const createdTopics: any[] = [];
      for (const topicData of syllabusData.topics) {
        const topic = await prisma.topic.create({
          data: {
            title: topicData.title,
            description: topicData.description || null,
            subjectId: subjectId!,
            gradeLevel: gl,
            orderIndex: topicData.orderIndex || (createdTopics.length + 1),
          },
        });

        let subtopicCount = 0;
        if (Array.isArray(topicData.subtopics)) {
          for (const stData of topicData.subtopics) {
            await prisma.subTopic.create({
              data: {
                title: stData.title,
                description: stData.description || null,
                learningObjectives: stData.learningObjectives ? JSON.stringify(stData.learningObjectives) : null,
                topicId: topic.id,
                orderIndex: stData.orderIndex || (subtopicCount + 1),
                duration: stData.duration || null,
              },
            });
            subtopicCount++;
          }
        }
        createdTopics.push({ title: topic.title, subtopicCount });
      }

      const totalSubtopics = createdTopics.reduce((sum, t) => sum + t.subtopicCount, 0);
      return {
        created: createdTopics,
        subject: subjectInfo.name,
        gradeLevel: gl,
        summary: `Generated ${createdTopics.length} topics with ${totalSubtopics} subtopics for ${subjectInfo.name} (Grade ${gl})`,
      };
    },
  },

  // ===================== BULK SYLLABUS POPULATION (BACKGROUND JOB) =====================
  {
    name: 'populate_all_syllabi',
    description: 'Start a BACKGROUND JOB to populate syllabus for all subjects across grade levels. Returns immediately — the job runs in the background. Use check_syllabus_progress to monitor. Use this when the user asks to "populate everything", "setup the whole curriculum", "add syllabus for all subjects".',
    parameters: [
      { name: 'gradeLevels', type: 'array', description: 'Array of grade level numbers. Defaults to [-3,-2,-1,0,1,2,3,4,5,6,7]. ECE: -3 to 0, Primary: 1-7, Secondary: 8-12.' },
      { name: 'subjectCodes', type: 'array', description: 'Optional: only populate these subject codes. If omitted, populates ALL subjects.' },
    ],
    execute: async (params) => {
      // Check if a job is already running
      for (const [, job] of bulkSyllabusJobs) {
        if (job.status === 'running') {
          return {
            summary: `A bulk syllabus job is already running (${job.completed}/${job.total} done, currently: ${job.current || '?'}). Use check_syllabus_progress to monitor.`,
          };
        }
      }

      // Resolve subjects
      let subjects: { id: string; name: string; code: string }[];
      if (params.subjectCodes?.length) {
        subjects = [];
        for (const code of params.subjectCodes) {
          const sub = await prisma.subject.findFirst({ where: { code: { equals: code, mode: 'insensitive' } }, select: { id: true, name: true, code: true } });
          if (sub) subjects.push(sub);
        }
      } else {
        subjects = await prisma.subject.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } });
      }

      if (subjects.length === 0) {
        return { error: 'No subjects found. Create subjects first.' };
      }

      const gradeLevels: number[] = params.gradeLevels?.length
        ? params.gradeLevels.map(Number)
        : [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];

      // Check existing
      const existingCounts = await prisma.topic.groupBy({
        by: ['subjectId', 'gradeLevel'],
        where: { subjectId: { in: subjects.map(s => s.id) }, gradeLevel: { in: gradeLevels } },
        _count: { id: true },
      });
      const existingSet = new Set(existingCounts.map(e => `${e.subjectId}_${e.gradeLevel}`));

      const workQueue: { subject: typeof subjects[0]; gradeLevel: number }[] = [];
      const inappropriateSkips: string[] = [];
      for (const subject of subjects) {
        for (const gl of gradeLevels) {
          if (existingSet.has(`${subject.id}_${gl}`)) continue;
          // Skip subjects that don't belong at this grade level per Zambian curriculum
          if (!isSubjectValidForGrade(subject.code, gl)) {
            inappropriateSkips.push(`${subject.code} Gr${gl}`);
            continue;
          }
          workQueue.push({ subject, gradeLevel: gl });
        }
      }

      const skippedExisting = existingCounts.length;
      const skippedCount = skippedExisting + inappropriateSkips.length;

      if (workQueue.length === 0) {
        return { summary: `All ${subjects.length} subjects already have topics for the requested grades. Nothing to generate.`, skipped: skippedCount };
      }

      // Create job tracker
      const jobId = `job_${Date.now()}`;
      const job: BulkSyllabusJob = {
        status: 'running',
        startedAt: new Date(),
        total: workQueue.length,
        completed: 0,
        skipped: skippedCount,
        failed: 0,
        totalTopics: 0,
        totalSubtopics: 0,
        errors: [],
        successes: [],
      };
      bulkSyllabusJobs.set(jobId, job);
      cleanOldJobs();

      // Launch background processing (fire-and-forget)
      const processInBackground = async () => {
        for (const item of workQueue) {
          const { subject, gradeLevel: gl } = item;
          job.current = `${subject.name} Grade ${gl}`;
          try {
            let levelDesc = '';
            if (gl <= -1) levelDesc = `ECE, age ${gl + 6} years`;
            else if (gl === 0) levelDesc = `ECE Reception, age 5-6 years`;
            else if (gl <= 4) levelDesc = `Lower Primary Grade ${gl}`;
            else if (gl <= 7) levelDesc = `Upper Primary Grade ${gl}`;
            else levelDesc = `Secondary Grade ${gl}`;

            // Fetch official CDC curriculum content
            let curriculumRef = '';
            try { curriculumRef = await curriculumService.getCurriculumContext(subject.code, gl); } catch {}

            const prompt = `You are a Zambian curriculum expert. Generate a syllabus for:
SUBJECT: ${subject.name} (${subject.code}), LEVEL: ${levelDesc}, COUNTRY: Zambia
${gl <= 0 ? 'ECE: play-based learning, developmental milestones.' : ''}
${gl >= 1 && gl <= 4 ? 'Lower primary: foundational skills, hands-on activities.' : ''}
${curriculumRef ? `\n=== OFFICIAL CDC CURRICULUM REFERENCE ===\nUse this as PRIMARY source of truth:\n${curriculumRef}\n=== END REFERENCE ===\n` : ''}
Return ONLY valid JSON: {"topics":[{"title":"...","description":"...","orderIndex":1,"subtopics":[{"title":"...","description":"...","learningObjectives":["..."],"duration":40,"orderIndex":1}]}]}
Requirements: 6-12 topics, 2-5 subtopics each, Zambian CDC curriculum, duration ${gl <= 0 ? '20-30' : '30-80'} min, cover 3 terms. ONLY JSON.`;

            const aiResponse = await aiService.chat([{ role: 'user', content: prompt }], { temperature: 0.4, maxTokens: 4000 });
            const content = aiResponse.content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const syllabusData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);

            if (!syllabusData?.topics || !Array.isArray(syllabusData.topics)) throw new Error('Invalid AI structure');

            let topicCount = 0, subtopicCount = 0;
            for (const td of syllabusData.topics) {
              const topic = await prisma.topic.create({
                data: { title: td.title, description: td.description || null, subjectId: subject.id, gradeLevel: gl, orderIndex: td.orderIndex || (topicCount + 1) },
              });
              topicCount++;
              if (Array.isArray(td.subtopics)) {
                for (const st of td.subtopics) {
                  await prisma.subTopic.create({
                    data: {
                      title: st.title, description: st.description || null,
                      learningObjectives: st.learningObjectives ? JSON.stringify(st.learningObjectives) : null,
                      topicId: topic.id, orderIndex: st.orderIndex || (subtopicCount + 1), duration: st.duration || null,
                    },
                  });
                  subtopicCount++;
                }
              }
            }
            job.totalTopics += topicCount;
            job.totalSubtopics += subtopicCount;
            job.completed++;
            job.successes.push(`${subject.name} Gr${gl}: ${topicCount}t/${subtopicCount}st`);
          } catch (err: any) {
            job.failed++;
            job.completed++;
            job.errors.push(`${subject.name} Gr${gl}: ${(err.message || 'unknown').substring(0, 80)}`);
          }
        }
        job.status = job.errors.length === job.total ? 'failed' : 'completed';
        job.completedAt = new Date();
        job.current = undefined;
      };

      // Fire and forget — don't await
      processInBackground().catch(err => {
        job.status = 'failed';
        job.completedAt = new Date();
        job.errors.push(`Fatal: ${err.message}`);
      });

      return {
        summary: `Background job started: ${workQueue.length} subject-grade combos to generate (${skippedExisting} already existed, ${inappropriateSkips.length} skipped as not in curriculum for those grades). Ask "check syllabus progress" to monitor.`,
        jobId,
        total: workQueue.length,
        skipped: skippedCount,
        curriculumSkipped: inappropriateSkips.length > 20 ? inappropriateSkips.slice(0, 20).concat([`...and ${inappropriateSkips.length - 20} more`]) : inappropriateSkips,
        subjects: subjects.map(s => s.name),
        gradeLevels,
      };
    },
  },

  {
    name: 'check_syllabus_progress',
    description: 'Check the progress of a running bulk syllabus generation job. Use this when the user asks "how is the syllabus going", "check progress", "syllabus status", etc.',
    parameters: [],
    execute: async () => {
      // Find the most recent job
      const jobs = [...bulkSyllabusJobs.entries()];
      if (jobs.length === 0) {
        return { summary: 'No bulk syllabus jobs have been started. Use populate_all_syllabi to start one.' };
      }
      const [jobId, job] = jobs[jobs.length - 1];
      const elapsed = Math.round((Date.now() - job.startedAt.getTime()) / 1000);
      const elapsedStr = elapsed > 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;

      return {
        jobId,
        status: job.status,
        progress: `${job.completed}/${job.total}`,
        percentComplete: job.total > 0 ? `${Math.round((job.completed / job.total) * 100)}%` : '0%',
        current: job.current || null,
        elapsed: elapsedStr,
        totalTopics: job.totalTopics,
        totalSubtopics: job.totalSubtopics,
        skipped: job.skipped,
        failedCount: job.failed,
        recentSuccesses: job.successes.slice(-5),
        recentErrors: job.errors.slice(-5),
        summary: job.status === 'running'
          ? `Running: ${job.completed}/${job.total} done (${Math.round((job.completed / job.total) * 100)}%), currently generating ${job.current || '...'} — ${elapsedStr} elapsed. ${job.totalTopics} topics, ${job.totalSubtopics} subtopics so far.`
          : `${job.status === 'completed' ? 'Completed' : 'Failed'}: ${job.completed}/${job.total} processed in ${elapsedStr}. ${job.totalTopics} topics, ${job.totalSubtopics} subtopics generated. ${job.failed > 0 ? `${job.failed} failed.` : ''}`,
      };
    },
  },

  {
    name: 'cleanup_invalid_syllabi',
    description: 'Find and delete syllabus topics that were incorrectly generated for grade levels where the subject doesn\'t belong (e.g. Additional Mathematics at ECE). Uses the Zambian curriculum mapping. Use dryRun=true to preview what would be deleted without actually deleting.',
    parameters: [
      { name: 'dryRun', type: 'string', description: 'Set to "true" to preview only, "false" to actually delete. Default: true (preview).', enum: ['true', 'false'] },
    ],
    execute: async (params) => {
      const dryRun = params.dryRun !== 'false';
      const subjects = await prisma.subject.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } });

      const invalidEntries: { subjectName: string; subjectCode: string; gradeLevel: number; topicCount: number; subtopicCount: number }[] = [];

      for (const subject of subjects) {
        const range = getSubjectGradeRange(subject.code);
        if (!range) continue; // Unknown code — skip

        // Find topics at invalid grade levels
        const invalidTopics = await prisma.topic.findMany({
          where: {
            subjectId: subject.id,
            OR: [
              { gradeLevel: { lt: range.min } },
              { gradeLevel: { gt: range.max } },
            ],
          },
          select: { id: true, gradeLevel: true, _count: { select: { subtopics: true } } },
        });

        if (invalidTopics.length === 0) continue;

        // Group by grade
        const byGrade: Record<number, typeof invalidTopics> = {};
        for (const t of invalidTopics) {
          if (!byGrade[t.gradeLevel]) byGrade[t.gradeLevel] = [];
          byGrade[t.gradeLevel].push(t);
        }

        for (const [gl, topics] of Object.entries(byGrade)) {
          const subtopicCount = topics.reduce((s, t) => s + t._count.subtopics, 0);
          invalidEntries.push({
            subjectName: subject.name,
            subjectCode: subject.code,
            gradeLevel: Number(gl),
            topicCount: topics.length,
            subtopicCount,
          });

          if (!dryRun) {
            const topicIds = topics.map(t => t.id);
            await prisma.subTopic.deleteMany({ where: { topicId: { in: topicIds } } });
            await prisma.topicProgress.deleteMany({ where: { topicId: { in: topicIds } } }).catch(() => {});
            await prisma.topic.deleteMany({ where: { id: { in: topicIds } } });
          }
        }
      }

      if (invalidEntries.length === 0) {
        return { summary: 'No invalid syllabus entries found. All subjects are correctly mapped to appropriate grade levels.' };
      }

      const totalTopics = invalidEntries.reduce((s, e) => s + e.topicCount, 0);
      const totalSubtopics = invalidEntries.reduce((s, e) => s + e.subtopicCount, 0);

      return {
        summary: dryRun
          ? `Found ${totalTopics} topics and ${totalSubtopics} subtopics that don't belong at their grade levels. Run with dryRun=false to delete them.`
          : `Deleted ${totalTopics} invalid topics and ${totalSubtopics} subtopics across ${invalidEntries.length} subject-grade combos.`,
        dryRun,
        invalidEntries: invalidEntries.map(e => `${e.subjectName} (${e.subjectCode}) at Grade ${e.gradeLevel}: ${e.topicCount} topics, ${e.subtopicCount} subtopics`),
        totalTopics,
        totalSubtopics,
      };
    },
  },

  {
    name: 'create_topics',
    description: 'Manually create topics (and optional subtopics) for a subject at a grade level. Use this for bulk seeding specific topics without AI generation.',
    parameters: [
      { name: 'subjectId', type: 'string', description: 'Subject ID' },
      { name: 'subjectCode', type: 'string', description: 'Subject code (used to look up subject if no subjectId)' },
      { name: 'gradeLevel', type: 'number', description: 'Grade level', required: true },
      { name: 'topics', type: 'array', description: 'Array of: title, description (optional), orderIndex (number), subtopics (optional array of { title, description, learningObjectives (string[]), duration (minutes), orderIndex })', required: true },
    ],
    execute: async (params) => {
      let subjectId = params.subjectId;
      if (!subjectId && params.subjectCode) {
        const sub = await prisma.subject.findFirst({ where: { code: { equals: params.subjectCode, mode: 'insensitive' } } });
        if (!sub) return { error: `Subject with code "${params.subjectCode}" not found` };
        subjectId = sub.id;
      }
      if (!subjectId) return { error: 'Please provide subjectId or subjectCode' };

      const gl = Number(params.gradeLevel);
      const topicsArr = params.topics as any[];
      const created: { title: string; subtopicCount: number }[] = [];
      const errors: string[] = [];

      for (const t of topicsArr) {
        try {
          const topic = await prisma.topic.create({
            data: {
              title: t.title,
              description: t.description || null,
              subjectId,
              gradeLevel: gl,
              orderIndex: t.orderIndex || (created.length + 1),
            },
          });

          let subtopicCount = 0;
          if (Array.isArray(t.subtopics)) {
            for (const st of t.subtopics) {
              await prisma.subTopic.create({
                data: {
                  title: st.title,
                  description: st.description || null,
                  learningObjectives: st.learningObjectives ? JSON.stringify(st.learningObjectives) : null,
                  topicId: topic.id,
                  orderIndex: st.orderIndex || (subtopicCount + 1),
                  duration: st.duration || null,
                },
              });
              subtopicCount++;
            }
          }
          created.push({ title: topic.title, subtopicCount });
        } catch (err: any) {
          errors.push(`Topic "${t.title}": ${err.message?.split('\n').pop()}`);
        }
      }

      const totalSubtopics = created.reduce((sum, t) => sum + t.subtopicCount, 0);
      return { created, errors, summary: `${created.length} topics created with ${totalSubtopics} subtopics, ${errors.length} failed` };
    },
  },

  {
    name: 'delete_topics',
    description: 'Delete all topics (and their subtopics) for a subject at a specific grade level. Useful to clear out syllabus data before regenerating.',
    parameters: [
      { name: 'subjectId', type: 'string', description: 'Subject ID' },
      { name: 'subjectCode', type: 'string', description: 'Subject code' },
      { name: 'gradeLevel', type: 'number', description: 'Grade level to delete topics for', required: true },
    ],
    execute: async (params) => {
      let subjectId = params.subjectId;
      if (!subjectId && params.subjectCode) {
        const sub = await prisma.subject.findFirst({ where: { code: { equals: params.subjectCode, mode: 'insensitive' } } });
        if (!sub) return { error: `Subject with code "${params.subjectCode}" not found` };
        subjectId = sub.id;
      }
      if (!subjectId) return { error: 'Please provide subjectId or subjectCode' };

      const gl = Number(params.gradeLevel);

      // Find topics to delete
      const topics = await prisma.topic.findMany({ where: { subjectId, gradeLevel: gl }, select: { id: true } });
      if (topics.length === 0) return { deleted: 0, summary: 'No topics found to delete' };

      // Delete subtopics first (cascade should handle this, but be safe)
      const subResult = await prisma.subTopic.deleteMany({ where: { topicId: { in: topics.map(t => t.id) } } });
      // Delete progress
      await prisma.topicProgress.deleteMany({ where: { topicId: { in: topics.map(t => t.id) } } }).catch(() => {});
      // Delete topics
      const result = await prisma.topic.deleteMany({ where: { subjectId, gradeLevel: gl } });

      return { deleted: result.count, subtopicsDeleted: subResult.count, summary: `Deleted ${result.count} topics and ${subResult.count} subtopics` };
    },
  },

  // ===================== AI LESSON PLAN GENERATION =====================
  {
    name: 'generate_lesson_plans',
    description: 'AI-generate and SAVE lesson plans for a subject\'s topics. Creates one lesson plan per topic, covering all subtopics. Requires a class (to link the plan) — auto-resolves class from gradeLevel if not provided. Great for bulk-populating lesson plans after syllabus is seeded.',
    parameters: [
      { name: 'subjectCode', type: 'string', description: 'Subject code (e.g. MATH, ENG)', required: true },
      { name: 'gradeLevel', type: 'number', description: 'Grade level', required: true },
      { name: 'classId', type: 'string', description: 'Class ID. If omitted, auto-finds a class at the given grade level.' },
      { name: 'maxTopics', type: 'number', description: 'Max topics to generate plans for (default 5). Use to limit for speed.' },
    ],
    execute: async (params, userId) => {
      // Resolve subject
      const subject = await prisma.subject.findFirst({ where: { code: { equals: params.subjectCode, mode: 'insensitive' } }, select: { id: true, name: true, code: true } });
      if (!subject) return { error: `Subject "${params.subjectCode}" not found.` };

      const gl = Number(params.gradeLevel);

      // Resolve class
      let classId = params.classId;
      let classInfo: any = null;
      if (classId) {
        classInfo = await prisma.class.findUnique({ where: { id: classId }, select: { id: true, name: true } });
      }
      if (!classInfo) {
        classInfo = await prisma.class.findFirst({ where: { gradeLevel: gl }, select: { id: true, name: true } });
      }
      if (!classInfo) return { error: `No class found for grade ${gl}. Create classes first.` };
      classId = classInfo.id;

      // Resolve term
      const term = await prisma.academicTerm.findFirst({ where: { isActive: true } }) || await prisma.academicTerm.findFirst({ orderBy: { startDate: 'desc' } });
      if (!term) return { error: 'No academic term found. Create one first.' };

      // Get topics with subtopics
      const topics = await prisma.topic.findMany({
        where: { subjectId: subject.id, gradeLevel: gl },
        include: { subtopics: { orderBy: { orderIndex: 'asc' } } },
        orderBy: { orderIndex: 'asc' },
        take: params.maxTopics || 5,
      });

      if (topics.length === 0) return { error: `No topics found for ${subject.name} at grade ${gl}. Generate syllabus first.` };

      // Fetch official CDC curriculum content
      let curriculumRef = '';
      try { curriculumRef = await curriculumService.getCurriculumContext(subject.code, gl); } catch {}

      const created: string[] = [];
      const errors: string[] = [];

      for (const topic of topics) {
        try {
          // Check if lesson plan already exists for this topic
          const existing = await prisma.lessonPlan.findFirst({
            where: { subjectId: subject.id, classId, title: { contains: topic.title } },
          });
          if (existing) { created.push(`${topic.title} (already exists)`); continue; }

          const subtopicList = topic.subtopics.map((st, i) => {
            let objs: string[] = [];
            try { objs = st.learningObjectives ? JSON.parse(st.learningObjectives) : []; } catch {}
            return `${i + 1}. ${st.title}${st.description ? ` — ${st.description}` : ''}${objs.length ? `\n   Objectives: ${objs.join('; ')}` : ''}`;
          }).join('\n');

          const duration = gl <= 0 ? 25 : gl <= 4 ? 35 : 45;
          const prompt = `Generate a structured lesson plan for a Zambian classroom.
SUBJECT: ${subject.name}, GRADE: ${gl <= 0 ? `ECE (${gl})` : gl}, TOPIC: ${topic.title}${topic.description ? ` — ${topic.description}` : ''}
DURATION: ${duration} minutes
${subtopicList ? `SUBTOPICS:\n${subtopicList}` : ''}
${curriculumRef ? `\n=== OFFICIAL CDC CURRICULUM REFERENCE ===\nUse this official content to ensure lesson aligns with the Zambian CDC syllabus:\n${curriculumRef.substring(0, 6000)}\n=== END REFERENCE ===\n` : ''}

Create a lesson plan with these sections:
1. **Introduction** (5 min) — Hook, recap, today's objectives
2. **Teaching** — Main content with examples relevant to Zambian context
3. **Activity** — Hands-on exercise or group activity
4. **Assessment** — 3-5 quick check questions
5. **Wrap-up** — Summary, homework if applicable

Write in clear, teacher-friendly language. Include specific examples and teaching tips.`;

          const aiResponse = await aiService.chat([{ role: 'user', content: prompt }], { temperature: 0.5, maxTokens: 1500 });

          await prisma.lessonPlan.create({
            data: {
              title: `${subject.name}: ${topic.title}`,
              content: aiResponse.content,
              teacherId: userId,
              classId,
              subjectId: subject.id,
              termId: term.id,
              weekStartDate: new Date(),
            },
          });
          created.push(topic.title);
        } catch (err: any) {
          errors.push(`${topic.title}: ${(err.message || 'error').substring(0, 80)}`);
        }
      }

      return {
        created,
        errors,
        subject: subject.name,
        class: classInfo.name,
        summary: `Generated ${created.length} lesson plans for ${subject.name} (${classInfo.name}). ${errors.length > 0 ? `${errors.length} failed.` : ''}`,
      };
    },
  },

  // ===================== AI ASSESSMENT GENERATION =====================
  {
    name: 'generate_assessments',
    description: 'AI-generate assessments (tests with questions) for a subject\'s topics at a grade level. Creates one assessment per topic with AI-generated questions. Auto-resolves class and term.',
    parameters: [
      { name: 'subjectCode', type: 'string', description: 'Subject code (e.g. MATH, ENG)', required: true },
      { name: 'gradeLevel', type: 'number', description: 'Grade level', required: true },
      { name: 'assessmentType', type: 'string', description: 'Type of assessment', enum: ['EXAM', 'TEST', 'QUIZ'], },
      { name: 'classId', type: 'string', description: 'Class ID. If omitted, auto-finds class at grade level.' },
      { name: 'maxTopics', type: 'number', description: 'Max topics to generate assessments for (default 5).' },
    ],
    execute: async (params) => {
      const subject = await prisma.subject.findFirst({ where: { code: { equals: params.subjectCode, mode: 'insensitive' } }, select: { id: true, name: true, code: true } });
      if (!subject) return { error: `Subject "${params.subjectCode}" not found.` };

      const gl = Number(params.gradeLevel);
      const assessmentType = params.assessmentType || 'TEST';

      let classInfo: any = params.classId
        ? await prisma.class.findUnique({ where: { id: params.classId }, select: { id: true, name: true } })
        : null;
      if (!classInfo) {
        classInfo = await prisma.class.findFirst({ where: { gradeLevel: gl }, select: { id: true, name: true } });
      }
      if (!classInfo) return { error: `No class found for grade ${gl}. Create classes first.` };

      const term = await prisma.academicTerm.findFirst({ where: { isActive: true } }) || await prisma.academicTerm.findFirst({ orderBy: { startDate: 'desc' } });
      if (!term) return { error: 'No academic term found. Create one first.' };

      const topics = await prisma.topic.findMany({
        where: { subjectId: subject.id, gradeLevel: gl },
        include: { subtopics: { orderBy: { orderIndex: 'asc' }, take: 5 } },
        orderBy: { orderIndex: 'asc' },
        take: params.maxTopics || 5,
      });

      if (topics.length === 0) return { error: `No topics found for ${subject.name} at grade ${gl}. Generate syllabus first.` };

      // Fetch official CDC curriculum content
      let curriculumRef = '';
      try { curriculumRef = await curriculumService.getCurriculumContext(subject.code, gl); } catch {}

      const created: string[] = [];
      const errors: string[] = [];

      for (const topic of topics) {
        try {
          const existing = await prisma.assessment.findFirst({
            where: { subjectId: subject.id, classId: classInfo.id, title: { contains: topic.title } },
          });
          if (existing) { created.push(`${topic.title} (already exists)`); continue; }

          const subtopicNames = topic.subtopics.map(st => st.title).join(', ');
          const questionCount = assessmentType === 'QUIZ' ? 5 : assessmentType === 'EXAM' ? 15 : 10;
          const totalMarks = assessmentType === 'QUIZ' ? 20 : assessmentType === 'EXAM' ? 100 : 50;

          const prompt = `Generate ${questionCount} assessment questions for Zambian students.
SUBJECT: ${subject.name}, GRADE: ${gl}, TOPIC: ${topic.title}
SUBTOPICS: ${subtopicNames || 'N/A'}
TYPE: ${assessmentType}
${curriculumRef ? `\n=== OFFICIAL CDC CURRICULUM REFERENCE ===\nAlign questions with the official Zambian CDC syllabus:\n${curriculumRef.substring(0, 4000)}\n=== END REFERENCE ===\n` : ''}

Return ONLY valid JSON array:
[{"question":"...","type":"MULTIPLE_CHOICE","options":["A)...","B)...","C)...","D)..."],"correctAnswer":"A","marks":${Math.round(totalMarks / questionCount)},"explanation":"Why this is correct"}]

Requirements:
- Mix question types: multiple choice, short answer, true/false
- For short answer, omit "options" field and set type to "SHORT_ANSWER"
- Age-appropriate for grade ${gl}, Zambian context
- Cover the subtopics evenly
- Return ONLY JSON array.`;

          const aiResponse = await aiService.chat([{ role: 'user', content: prompt }], { temperature: 0.4, maxTokens: 2000 });

          // Parse questions
          let questions: any[] = [];
          try {
            const content = aiResponse.content;
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            questions = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
          } catch {
            questions = [];
          }

          const assessment = await prisma.assessment.create({
            data: {
              title: `${assessmentType === 'QUIZ' ? 'Quiz' : assessmentType === 'EXAM' ? 'Exam' : 'Test'}: ${topic.title}`,
              type: assessmentType as any,
              classId: classInfo.id,
              subjectId: subject.id,
              termId: term.id,
              totalMarks,
              weight: assessmentType === 'QUIZ' ? 10 : assessmentType === 'EXAM' ? 40 : 25,
              date: new Date(),
              description: `AI-generated ${assessmentType.toLowerCase()} covering: ${topic.title}`,
            },
          });

          // Save questions if parsed successfully
          if (questions.length > 0) {
            for (let i = 0; i < questions.length; i++) {
              const q = questions[i];
              const qType = q.type === 'SHORT_ANSWER' ? 'SHORT_ANSWER' : q.type === 'TRUE_FALSE' ? 'TRUE_FALSE' : q.type === 'ESSAY' ? 'ESSAY' : 'MULTIPLE_CHOICE';
              const points = q.marks || q.points || Math.round(totalMarks / questionCount);

              const question = await prisma.question.create({
                data: {
                  assessmentId: assessment.id,
                  text: q.question || q.questionText || `Question ${i + 1}`,
                  type: qType as any,
                  points,
                  correctAnswer: q.correctAnswer || null,
                },
              });

              // Create options for multiple choice / true-false
              if (Array.isArray(q.options) && q.options.length > 0) {
                for (const opt of q.options) {
                  const optText = typeof opt === 'string' ? opt : opt.text || String(opt);
                  const isCorrect = q.correctAnswer ? optText.startsWith(q.correctAnswer) || optText === q.correctAnswer : false;
                  await prisma.questionOption.create({
                    data: {
                      questionId: question.id,
                      text: optText,
                      isCorrect,
                    },
                  });
                }
              }
            }
          }

          created.push(`${topic.title} (${questions.length} questions)`);
        } catch (err: any) {
          errors.push(`${topic.title}: ${(err.message || 'error').substring(0, 80)}`);
        }
      }

      return {
        created,
        errors,
        subject: subject.name,
        class: classInfo.name,
        assessmentType,
        summary: `Generated ${created.length} ${assessmentType.toLowerCase()}s for ${subject.name} (${classInfo.name}). ${errors.length > 0 ? `${errors.length} failed.` : ''}`,
      };
    },
  },

  // ===================== AI HOMEWORK GENERATION =====================
  {
    name: 'generate_homework',
    description: 'AI-generate homework assignments for a subject\'s topics at a grade level. Creates one homework assessment per topic with structured tasks. Auto-resolves class and term.',
    parameters: [
      { name: 'subjectCode', type: 'string', description: 'Subject code (e.g. MATH, ENG)', required: true },
      { name: 'gradeLevel', type: 'number', description: 'Grade level', required: true },
      { name: 'classId', type: 'string', description: 'Class ID. If omitted, auto-finds class at grade level.' },
      { name: 'maxTopics', type: 'number', description: 'Max topics to generate homework for (default 5).' },
    ],
    execute: async (params) => {
      const subject = await prisma.subject.findFirst({ where: { code: { equals: params.subjectCode, mode: 'insensitive' } }, select: { id: true, name: true, code: true } });
      if (!subject) return { error: `Subject "${params.subjectCode}" not found.` };

      const gl = Number(params.gradeLevel);

      let classInfo: any = params.classId
        ? await prisma.class.findUnique({ where: { id: params.classId }, select: { id: true, name: true } })
        : null;
      if (!classInfo) {
        classInfo = await prisma.class.findFirst({ where: { gradeLevel: gl }, select: { id: true, name: true } });
      }
      if (!classInfo) return { error: `No class found for grade ${gl}. Create classes first.` };

      const term = await prisma.academicTerm.findFirst({ where: { isActive: true } }) || await prisma.academicTerm.findFirst({ orderBy: { startDate: 'desc' } });
      if (!term) return { error: 'No academic term found. Create one first.' };

      const topics = await prisma.topic.findMany({
        where: { subjectId: subject.id, gradeLevel: gl },
        include: { subtopics: { orderBy: { orderIndex: 'asc' }, take: 5 } },
        orderBy: { orderIndex: 'asc' },
        take: params.maxTopics || 5,
      });

      if (topics.length === 0) return { error: `No topics found for ${subject.name} at grade ${gl}. Generate syllabus first.` };

      // Fetch official CDC curriculum content
      let curriculumRef = '';
      try { curriculumRef = await curriculumService.getCurriculumContext(subject.code, gl); } catch {}

      // Build topics & subtopics listing for the response
      const topicsListing = topics.map(t => ({
        topic: t.title,
        subtopics: t.subtopics.map(st => st.title),
      }));

      const created: string[] = [];
      const errors: string[] = [];

      for (const topic of topics) {
        try {
          const existing = await prisma.assessment.findFirst({
            where: { subjectId: subject.id, classId: classInfo.id, type: 'HOMEWORK', title: { contains: topic.title } },
          });
          if (existing) { created.push(`${topic.title} (already exists)`); continue; }

          const subtopicNames = topic.subtopics.map(st => st.title).join(', ');

          const prompt = `Generate a homework assignment for Zambian students.
SUBJECT: ${subject.name}, GRADE: ${gl}, TOPIC: ${topic.title}
SUBTOPICS: ${subtopicNames || 'N/A'}
${curriculumRef ? `\n=== OFFICIAL CDC CURRICULUM REFERENCE ===\nAlign homework with the official Zambian CDC syllabus:\n${curriculumRef.substring(0, 4000)}\n=== END REFERENCE ===\n` : ''}

Create a structured homework with:
1. A clear title
2. Instructions (2-3 sentences)
3. 3-5 tasks/questions appropriate for grade ${gl}
4. Total marks allocation

Write in clear simple English. Use Zambian context where relevant.
${gl <= 0 ? 'For ECE: use drawing, coloring, matching, and simple counting activities.' : ''}
${gl <= 4 ? 'For lower primary: keep tasks simple, concrete, and fun.' : ''}
Return the homework as structured text.`;

          const aiResponse = await aiService.chat([{ role: 'user', content: prompt }], { temperature: 0.5, maxTokens: 1000 });

          // Create as a HOMEWORK assessment
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 7); // Due in 1 week

          await prisma.assessment.create({
            data: {
              title: `Homework: ${topic.title}`,
              type: 'HOMEWORK',
              classId: classInfo.id,
              subjectId: subject.id,
              termId: term.id,
              totalMarks: 20,
              weight: 5,
              date: new Date(),
              dueDate,
              description: aiResponse.content,
            },
          });

          created.push(topic.title);
        } catch (err: any) {
          errors.push(`${topic.title}: ${(err.message || 'error').substring(0, 80)}`);
        }
      }

      return {
        created,
        errors,
        subject: subject.name,
        gradeLevel: gl,
        class: classInfo.name,
        topicsAndSubtopics: topicsListing,
        summary: `Generated ${created.length} homework assignments for ${subject.name} Grade ${gl} (${classInfo.name}). Topics: ${topicsListing.map(t => `${t.topic} [${t.subtopics.length} subtopics]`).join(', ')}. ${errors.length > 0 ? `${errors.length} failed.` : ''}`,
      };
    },
  },

  // ===================== LESSON PLANS =====================
  {
    name: 'list_lesson_plans',
    description: 'List saved lesson plans, optionally filtered by subject, class, or teacher. Returns the plan title, subject, class, date, and content preview.',
    parameters: [
      { name: 'subjectId', type: 'string', description: 'Filter by subject ID' },
      { name: 'subjectCode', type: 'string', description: 'Filter by subject code (e.g. MATH, ENG, BIO)' },
      { name: 'classId', type: 'string', description: 'Filter by class ID' },
      { name: 'limit', type: 'number', description: 'Max number of plans to return (default 10)' },
    ],
    execute: async (params) => {
      const where: any = {};
      if (params.subjectId) where.subjectId = params.subjectId;
      if (params.classId) where.classId = params.classId;
      if (params.subjectCode) {
        const subject = await prisma.subject.findFirst({ where: { code: params.subjectCode } });
        if (subject) where.subjectId = subject.id;
      }
      const plans = await prisma.lessonPlan.findMany({
        where,
        orderBy: { weekStartDate: 'desc' },
        take: params.limit || 10,
        include: {
          subject: { select: { name: true, code: true } },
          class: { select: { name: true, gradeLevel: true } },
          teacher: { select: { fullName: true } },
        },
      });
      return plans.map((p: any) => ({
        id: p.id,
        title: p.title,
        subject: `${p.subject.name} (${p.subject.code})`,
        class: `${p.class.name} (Grade ${p.class.gradeLevel})`,
        teacher: p.teacher.fullName,
        date: new Date(p.weekStartDate).toLocaleDateString(),
        contentPreview: p.content.substring(0, 200) + (p.content.length > 200 ? '...' : ''),
        fullContent: p.content,
      }));
    },
  },

  {
    name: 'get_lesson_plan_content',
    description: 'Get the full content of a specific lesson plan by its ID. Use this when a user wants to see, reference, or modify a particular lesson plan.',
    parameters: [
      { name: 'id', type: 'string', description: 'The lesson plan ID', required: true },
    ],
    execute: async (params) => {
      const plan = await prisma.lessonPlan.findUnique({
        where: { id: params.id },
        include: {
          subject: { select: { name: true, code: true } },
          class: { select: { name: true, gradeLevel: true } },
          teacher: { select: { fullName: true } },
          term: { select: { name: true } },
        },
      });
      if (!plan) return { error: 'Lesson plan not found' };
      return {
        id: plan.id,
        title: plan.title,
        subject: `${(plan as any).subject.name} (${(plan as any).subject.code})`,
        class: `${(plan as any).class.name} (Grade ${(plan as any).class.gradeLevel})`,
        teacher: (plan as any).teacher.fullName,
        term: (plan as any).term.name,
        date: new Date(plan.weekStartDate).toLocaleDateString(),
        content: plan.content,
      };
    },
  },

  // ===================== FEES =====================
  {
    name: 'create_fee_templates',
    description: 'Create fee templates (tuition, transport, uniform, etc.). Requires academicTermId. Use list_academic_terms first.',
    parameters: [
      { name: 'templates', type: 'array', description: 'Array of: name, amount (number), academicTermId (string), applicableGrade (number, default 1)', required: true },
    ],
    execute: async (params) => {
      const templates = params.templates as any[];
      // Find default term if not provided
      let defaultTermId = templates?.[0]?.academicTermId;
      if (!defaultTermId) {
        const term = await prisma.academicTerm.findFirst({ where: { isActive: true } }) || await prisma.academicTerm.findFirst({ orderBy: { startDate: 'desc' } });
        defaultTermId = term?.id;
      }
      const created = [];
      const existing = [];
      const errors: string[] = [];
      for (const t of templates) {
        try {
          // Check if a template with this name already exists for this term
          const existingTmpl = await prisma.feeTemplate.findFirst({
            where: { name: t.name, academicTermId: t.academicTermId || defaultTermId },
          });
          if (existingTmpl) {
            existing.push(existingTmpl);
            continue;
          }
          const tmpl = await prisma.feeTemplate.create({
            data: {
              name: t.name,
              amount: t.amount,
              academicTermId: t.academicTermId || defaultTermId,
              applicableGrade: t.applicableGrade || 1,
            },
          });
          created.push(tmpl);
        } catch (err: any) {
          errors.push(`Fee "${t.name}": ${err.message?.split('\n').pop()}`);
        }
      }
      return { created, existing, errors, summary: `${created.length} created, ${existing.length} already existed, ${errors.length} failed` };
    },
  },

  {
    name: 'list_fee_templates',
    description: 'List all fee templates.',
    parameters: [],
    execute: async () => {
      return prisma.feeTemplate.findMany({ orderBy: { name: 'asc' } });
    },
  },

  // ===================== ACADEMIC TERMS =====================
  {
    name: 'create_academic_terms',
    description: 'Create academic terms/semesters for the school year.',
    parameters: [
      { name: 'terms', type: 'array', description: 'Array of: name, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), isActive (boolean, optional)', required: true },
    ],
    execute: async (params) => {
      const terms = params.terms as any[];
      const created = [];
      const existing = [];
      const errors: string[] = [];
      for (const t of terms) {
        try {
          // Check if term with this name already exists
          const existingTerm = await prisma.academicTerm.findFirst({ where: { name: t.name } });
          if (existingTerm) {
            existing.push(existingTerm);
            continue;
          }
          const term = await prisma.academicTerm.create({
            data: {
              name: t.name,
              startDate: new Date(t.startDate),
              endDate: new Date(t.endDate),
              isActive: t.isActive || false,
            },
          });
          created.push(term);
        } catch (err: any) {
          errors.push(`Term "${t.name}": ${err.message?.split('\n').pop()}`);
        }
      }
      return { created, existing, errors, summary: `${created.length} created, ${existing.length} already existed, ${errors.length} failed` };
    },
  },

  {
    name: 'list_academic_terms',
    description: 'List all academic terms.',
    parameters: [],
    execute: async () => {
      return prisma.academicTerm.findMany({ orderBy: { startDate: 'desc' } });
    },
  },

  // ===================== ASSESSMENTS =====================
  {
    name: 'create_assessments',
    description: 'Create assessments (exams, tests, quizzes, homework). Requires classId, subjectId, and termId. Use list_classes, list_subjects, list_academic_terms first.',
    parameters: [
      { name: 'assessments', type: 'array', description: 'Array of: title, type (EXAM/TEST/QUIZ/HOMEWORK/PROJECT), classId, subjectId, termId, date (YYYY-MM-DD), totalMarks (number), weight (number, percentage weight)', required: true },
    ],
    execute: async (params) => {
      const assessments = params.assessments as any[];
      const created = [];
      const errors: string[] = [];
      for (const a of assessments) {
        try {
          const assessment = await prisma.assessment.create({
            data: {
              title: a.title,
              type: a.type || 'TEST',
              classId: a.classId,
              subjectId: a.subjectId,
              termId: a.termId,
              date: new Date(a.date),
              totalMarks: a.totalMarks || 100,
              weight: a.weight || 25,
            },
          });
          created.push(assessment);
        } catch (err: any) {
          errors.push(`Assessment "${a.title}": ${err.message?.split('\n').pop()}`);
        }
      }
      return { created, errors, summary: `${created.length} created, ${errors.length} failed` };
    },
  },

  // ===================== TIMETABLE =====================
  {
    name: 'create_timetable_periods',
    description: 'Create timetable periods for a class schedule. Requires subjectId, teacherId, and academicTermId. Use list tools to find IDs first.',
    parameters: [
      { name: 'periods', type: 'array', description: 'Array of: dayOfWeek (MONDAY-SUNDAY), startTime (HH:MM), endTime (HH:MM), subjectId, classId, teacherId, academicTermId', required: true },
    ],
    execute: async (params) => {
      const periods = params.periods as any[];
      // Find default term
      let defaultTermId = periods?.[0]?.academicTermId;
      if (!defaultTermId) {
        const term = await prisma.academicTerm.findFirst({ where: { isActive: true } }) || await prisma.academicTerm.findFirst({ orderBy: { startDate: 'desc' } });
        defaultTermId = term?.id;
      }
      const created = [];
      const errors: string[] = [];
      for (const p of periods) {
        try {
          const period = await prisma.timetablePeriod.create({
            data: {
              dayOfWeek: p.dayOfWeek,
              startTime: p.startTime,
              endTime: p.endTime,
              subjectId: p.subjectId,
              teacherId: p.teacherId,
              academicTermId: p.academicTermId || defaultTermId,
            },
          });
          // Link to class
          if (p.classId) {
            await prisma.timetablePeriodClass.create({
              data: { timetablePeriodId: period.id, classId: p.classId },
            });
          }
          created.push(period);
        } catch (err: any) {
          errors.push(`Period ${p.dayOfWeek} ${p.startTime}-${p.endTime}: ${err.message?.split('\n').pop()}`);
        }
      }
      return { created, errors, summary: `${created.length} created, ${errors.length} failed` };
    },
  },

  // ===================== USERS =====================
  {
    name: 'list_users',
    description: 'List users (teachers, admins, parents, etc.), optionally filtered by role.',
    parameters: [
      { name: 'role', type: 'string', description: 'Filter by role', enum: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT', 'STUDENT'] },
      { name: 'query', type: 'string', description: 'Search by name or email' },
    ],
    execute: async (params) => {
      const where: any = {};
      if (params.role) where.role = params.role;
      if (params.query) {
        where.OR = [
          { fullName: { contains: params.query, mode: 'insensitive' } },
          { email: { contains: params.query, mode: 'insensitive' } },
        ];
      }
      return prisma.user.findMany({
        where,
        select: { id: true, fullName: true, email: true, role: true, isActive: true },
        take: 30,
        orderBy: { fullName: 'asc' },
      });
    },
  },

  // ===================== ANNOUNCEMENTS =====================
  {
    name: 'create_announcements',
    description: 'Create announcements for the school community.',
    parameters: [
      { name: 'announcements', type: 'array', description: 'Array of: subject (title string), message (body text), targetRoles (array of role strings: SUPER_ADMIN, TEACHER, PARENT, etc.)', required: true },
    ],
    execute: async (params, userId) => {
      const announcements = params.announcements as any[];
      const created = [];
      const errors: string[] = [];
      for (const a of announcements) {
        try {
          const ann = await prisma.announcement.create({
            data: {
              subject: a.subject || a.title,
              message: a.message || a.content,
              targetRoles: a.targetRoles || ['SUPER_ADMIN', 'TEACHER', 'PARENT'],
              createdById: userId,
            },
          });
          created.push(ann);
        } catch (err: any) {
          errors.push(`Announcement "${a.subject || a.title}": ${err.message?.split('\n').pop()}`);
        }
      }
      return { created, errors, summary: `${created.length} created, ${errors.length} failed` };
    },
  },

  // ===================== NOTIFICATIONS =====================
  {
    name: 'send_notifications',
    description: 'Send notifications to specific users.',
    parameters: [
      { name: 'notifications', type: 'array', description: 'Array of: userId, title, message, type (INFO/WARNING/SUCCESS/ERROR)', required: true },
    ],
    execute: async (params) => {
      const notifications = params.notifications as any[];
      const created = [];
      const errors: string[] = [];
      for (const n of notifications) {
        try {
          const notif = await prisma.notification.create({
            data: {
              userId: n.userId,
              title: n.title,
              message: n.message,
              type: n.type || 'INFO',
            },
          });
          created.push(notif);
        } catch (err: any) {
          errors.push(`Notification for user ${n.userId}: ${err.message?.split('\n').pop()}`);
        }
      }
      return { created, errors, summary: `${created.length} sent, ${errors.length} failed` };
    },
  },

  // ===================== SCHOOL STATISTICS =====================
  {
    name: 'get_school_statistics',
    description: 'Get overview statistics: total students, teachers, classes, revenue, attendance rates, etc.',
    parameters: [],
    execute: async () => {
      const [studentCount, teacherCount, classCount, subjectCount, termCount, eventCount] = await Promise.all([
        prisma.student.count({ where: { status: 'ACTIVE' } }),
        prisma.user.count({ where: { role: 'TEACHER', isActive: true } }),
        prisma.class.count(),
        prisma.subject.count(),
        prisma.academicTerm.count(),
        prisma.academicEvent.count(),
      ]);
      return {
        activeStudents: studentCount,
        activeTeachers: teacherCount,
        totalClasses: classCount,
        totalSubjects: subjectCount,
        totalTerms: termCount,
        totalCalendarEvents: eventCount,
      };
    },
  },

  // ===================== SCHOLARSHIPS =====================
  {
    name: 'create_scholarships',
    description: 'Create scholarship definitions.',
    parameters: [
      { name: 'scholarships', type: 'array', description: 'Array of: name (string), percentage (number 0-100), description (optional string)', required: true },
    ],
    execute: async (params) => {
      const scholarships = params.scholarships as any[];
      const created = [];
      const existing = [];
      const errors: string[] = [];
      for (const s of scholarships) {
        try {
          // Check if scholarship with this name already exists
          const existingSch = await prisma.scholarship.findFirst({ where: { name: s.name } });
          if (existingSch) {
            existing.push(existingSch);
            continue;
          }
          const sch = await prisma.scholarship.create({
            data: {
              name: s.name,
              percentage: s.percentage || 50,
              description: s.description || null,
            },
          });
          created.push(sch);
        } catch (err: any) {
          errors.push(`Scholarship "${s.name}": ${err.message?.split('\n').pop()}`);
        }
      }
      return { created, existing, errors, summary: `${created.length} created, ${existing.length} already existed, ${errors.length} failed` };
    },
  },

  // ===================== EXPENSES =====================
  {
    name: 'create_expenses',
    description: 'Record school expenses (supplies, maintenance, utilities, etc.).',
    parameters: [
      { name: 'expenses', type: 'array', description: 'Array of: description, amount (number), category (SUPPLIES/MAINTENANCE/UTILITIES/TRANSPORT/SALARIES/OTHER), date (YYYY-MM-DD)', required: true },
    ],
    execute: async (params, userId) => {
      const expenses = params.expenses as any[];
      const created = [];
      const errors: string[] = [];
      for (let i = 0; i < expenses.length; i++) {
        try {
          const e = expenses[i];
          // Generate a unique expense number with random suffix to avoid collisions
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          const expenseNumber = `EXP-${new Date().getFullYear()}-${rand}${i}`;
          const amount = e.amount || 0;
          const expense = await prisma.expense.create({
            data: {
              expenseNumber,
              description: e.description,
              amount: amount,
              totalAmount: amount,
              category: e.category || 'OTHER',
              date: new Date(e.date || new Date()),
              requestedBy: userId,
              status: 'DRAFT',
            },
          });
          created.push(expense);
        } catch (err: any) {
          errors.push(`Expense "${expenses[i]?.description}": ${err.message?.split('\n').pop()}`);
        }
      }
      return { created, errors, summary: `${created.length} created, ${errors.length} failed` };
    },
  },

  // ===================== COMMUNICATION =====================
  {
    name: 'send_sms',
    description: 'Send SMS messages to a list of phone numbers or students. The AI should format message properly.',
    parameters: [
      { name: 'recipients', type: 'array', description: 'Array of objects: phone (string) and message (string)', required: true },
    ],
    execute: async (params, userId) => {
      const { smsService } = await import('./smsService');
      const recipients = params.recipients as any[];
      if (!recipients || recipients.length === 0) return { error: 'No recipients provided' };
      
      const result = await smsService.sendBulk(recipients, { sentById: userId });
      return { 
        summary: `Sent SMS to ${result.sent} recipients. Failed: ${result.failed}`, 
        details: result 
      };
    }
  },

  // ===================== PAYMENT TRANSACTIONS =====================
  {
    name: 'search_payments',
    description: 'Search and list fee payment transactions. Can filter by status (COMPLETED/FAILED/PENDING/VOIDED), payment method (CASH/MOBILE_MONEY/BANK_DEPOSIT), date range, student name/admission number, or amount range. Returns transaction details including student name, amount, method, status, and date.',
    parameters: [
      { name: 'status', type: 'string', description: 'Filter by payment status', enum: ['PENDING', 'COMPLETED', 'FAILED', 'VOIDED'] },
      { name: 'method', type: 'string', description: 'Filter by payment method', enum: ['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT'] },
      { name: 'startDate', type: 'string', description: 'Filter from date (YYYY-MM-DD)' },
      { name: 'endDate', type: 'string', description: 'Filter to date (YYYY-MM-DD)' },
      { name: 'studentQuery', type: 'string', description: 'Search by student name or admission number' },
      { name: 'minAmount', type: 'number', description: 'Minimum payment amount' },
      { name: 'maxAmount', type: 'number', description: 'Maximum payment amount' },
      { name: 'limit', type: 'number', description: 'Max results to return (default 25)' },
    ],
    execute: async (params) => {
      const where: any = {};
      if (params.status) where.status = params.status;
      if (params.method) where.method = params.method;
      if (params.startDate || params.endDate) {
        where.paymentDate = {};
        if (params.startDate) where.paymentDate.gte = new Date(params.startDate);
        if (params.endDate) where.paymentDate.lte = new Date(params.endDate + 'T23:59:59');
      }
      if (params.minAmount || params.maxAmount) {
        where.amount = {};
        if (params.minAmount) where.amount.gte = params.minAmount;
        if (params.maxAmount) where.amount.lte = params.maxAmount;
      }
      if (params.studentQuery) {
        where.student = {
          OR: [
            { firstName: { contains: params.studentQuery, mode: 'insensitive' } },
            { lastName: { contains: params.studentQuery, mode: 'insensitive' } },
            { admissionNumber: { contains: params.studentQuery, mode: 'insensitive' } },
          ],
        };
      }
      const payments = await prisma.payment.findMany({
        where,
        include: {
          student: { select: { firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } } },
          allocations: { include: { studentFee: { include: { feeTemplate: { select: { name: true } } } } } },
        },
        orderBy: { paymentDate: 'desc' },
        take: params.limit || 25,
      });
      return {
        count: payments.length,
        payments: payments.map(p => ({
          transactionId: p.transactionId,
          student: `${p.student.firstName} ${p.student.lastName} (${p.student.admissionNumber})`,
          class: p.student.class?.name || 'N/A',
          amount: Number(p.amount),
          method: p.method,
          status: p.status,
          date: p.paymentDate.toISOString().split('T')[0],
          feeItems: p.allocations.map(a => a.studentFee.feeTemplate.name).join(', ') || 'Unallocated',
          notes: p.notes || null,
          voidReason: p.voidReason || null,
        })),
      };
    },
  },

  {
    name: 'get_payment_analytics',
    description: 'Get a breakdown/summary of payment transactions — by status (paid/failed/pending/voided), by payment method (cash vs mobile money vs bank), totals collected, success rates, and daily/monthly trends. Perfect for financial reporting and dashboards.',
    parameters: [
      { name: 'startDate', type: 'string', description: 'Analysis period start (YYYY-MM-DD)' },
      { name: 'endDate', type: 'string', description: 'Analysis period end (YYYY-MM-DD)' },
      { name: 'groupBy', type: 'string', description: 'Group results by period', enum: ['day', 'week', 'month'] },
    ],
    execute: async (params) => {
      const dateFilter: any = {};
      if (params.startDate || params.endDate) {
        dateFilter.paymentDate = {};
        if (params.startDate) dateFilter.paymentDate.gte = new Date(params.startDate);
        if (params.endDate) dateFilter.paymentDate.lte = new Date(params.endDate + 'T23:59:59');
      }

      // Status breakdown
      const statusBreakdown = await prisma.payment.groupBy({
        by: ['status'],
        where: dateFilter,
        _count: { id: true },
        _sum: { amount: true },
      });

      // Method breakdown
      const methodBreakdown = await prisma.payment.groupBy({
        by: ['method'],
        where: { ...dateFilter, status: 'COMPLETED' },
        _count: { id: true },
        _sum: { amount: true },
      });

      // Overall totals
      const totalCompleted = await prisma.payment.aggregate({
        where: { ...dateFilter, status: 'COMPLETED' },
        _sum: { amount: true },
        _count: { id: true },
      });
      const totalAll = await prisma.payment.aggregate({
        where: dateFilter,
        _count: { id: true },
      });

      // Mobile money specific stats
      const mobileMoneyStats = await prisma.mobileMoneyCollection.groupBy({
        by: ['status'],
        where: params.startDate || params.endDate ? {
          initiatedAt: dateFilter.paymentDate,
        } : {},
        _count: { id: true },
        _sum: { amount: true },
      });

      // Recent failed transactions (last 10)
      const recentFailed = await prisma.payment.findMany({
        where: { ...dateFilter, status: 'FAILED' },
        include: { student: { select: { firstName: true, lastName: true, admissionNumber: true } } },
        orderBy: { paymentDate: 'desc' },
        take: 10,
      });

      const successRate = totalAll._count.id > 0
        ? ((totalCompleted._count.id / totalAll._count.id) * 100).toFixed(1)
        : '0';

      return {
        summary: {
          totalTransactions: totalAll._count.id,
          totalCollected: Number(totalCompleted._sum.amount || 0),
          successfulPayments: totalCompleted._count.id,
          successRate: `${successRate}%`,
        },
        byStatus: statusBreakdown.map(s => ({
          status: s.status,
          count: s._count.id,
          totalAmount: Number(s._sum.amount || 0),
        })),
        byMethod: methodBreakdown.map(m => ({
          method: m.method,
          count: m._count.id,
          totalAmount: Number(m._sum.amount || 0),
        })),
        mobileMoneyBreakdown: mobileMoneyStats.map(mm => ({
          status: mm.status,
          count: mm._count.id,
          totalAmount: Number(mm._sum.amount || 0),
        })),
        recentFailedTransactions: recentFailed.map(f => ({
          transactionId: f.transactionId,
          student: `${f.student.firstName} ${f.student.lastName} (${f.student.admissionNumber})`,
          amount: Number(f.amount),
          date: f.paymentDate.toISOString().split('T')[0],
          notes: f.notes,
        })),
      };
    },
  },

  {
    name: 'get_student_payment_history',
    description: 'Get the complete payment history for a specific student — every transaction they have made, including amounts, methods, statuses, dates, and what fee items each payment was allocated to. Can search by student name or admission number.',
    parameters: [
      { name: 'studentQuery', type: 'string', description: 'Student name or admission number to look up', required: true },
      { name: 'status', type: 'string', description: 'Filter by payment status', enum: ['PENDING', 'COMPLETED', 'FAILED', 'VOIDED'] },
      { name: 'limit', type: 'number', description: 'Max transactions to return (default 50)' },
    ],
    execute: async (params) => {
      // Find the student
      const students = await prisma.student.findMany({
        where: {
          OR: [
            { firstName: { contains: params.studentQuery, mode: 'insensitive' } },
            { lastName: { contains: params.studentQuery, mode: 'insensitive' } },
            { admissionNumber: { contains: params.studentQuery, mode: 'insensitive' } },
            { admissionNumber: { equals: params.studentQuery } },
          ],
        },
        select: { id: true, firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } },
        take: 5,
      });

      if (students.length === 0) {
        return { error: `No student found matching "${params.studentQuery}"` };
      }

      // If multiple matches, get history for the best match
      const student = students[0];
      const paymentWhere: any = { studentId: student.id };
      if (params.status) paymentWhere.status = params.status;

      const payments = await prisma.payment.findMany({
        where: paymentWhere,
        include: {
          allocations: { include: { studentFee: { include: { feeTemplate: { select: { name: true } } } } } },
          mobileMoneyCollection: { select: { phone: true, operator: true, status: true, reference: true } },
        },
        orderBy: { paymentDate: 'desc' },
        take: params.limit || 50,
      });

      // Get fee balances too
      const feeStructures = await prisma.studentFeeStructure.findMany({
        where: { studentId: student.id },
        include: { feeTemplate: { select: { name: true } } },
      });

      const totalPaid = payments
        .filter(p => p.status === 'COMPLETED')
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const totalDue = feeStructures.reduce((sum, f) => sum + Number(f.amountDue), 0);
      const totalBalance = totalDue - feeStructures.reduce((sum, f) => sum + Number(f.amountPaid), 0);

      return {
        student: {
          name: `${student.firstName} ${student.lastName}`,
          admissionNumber: student.admissionNumber,
          class: student.class?.name || 'N/A',
        },
        financialSummary: {
          totalFeesDue: totalDue,
          totalPaid,
          outstandingBalance: totalBalance,
          transactionCount: payments.length,
        },
        feeBalances: feeStructures.map(f => ({
          feeItem: f.feeTemplate.name,
          amountDue: Number(f.amountDue),
          amountPaid: Number(f.amountPaid),
          balance: Number(f.amountDue) - Number(f.amountPaid),
        })),
        transactions: payments.map(p => ({
          transactionId: p.transactionId,
          amount: Number(p.amount),
          method: p.method,
          status: p.status,
          date: p.paymentDate.toISOString().split('T')[0],
          feeItems: p.allocations.map(a => `${a.studentFee.feeTemplate.name} (K${Number(a.amount)})`).join(', ') || 'Unallocated',
          mobileMoney: p.mobileMoneyCollection ? {
            phone: p.mobileMoneyCollection.phone,
            operator: p.mobileMoneyCollection.operator,
            status: p.mobileMoneyCollection.status,
            reference: p.mobileMoneyCollection.reference,
          } : null,
          notes: p.notes,
          voidReason: p.voidReason || null,
        })),
        otherMatches: students.length > 1 ? students.slice(1).map(s => `${s.firstName} ${s.lastName} (${s.admissionNumber})`) : [],
      };
    },
  },

  {
    name: 'get_student_fee_balances',
    description: 'Get fee balance status for students — who has paid, who has outstanding balances, which fee items are unpaid. Can filter by class/grade, or show only students with overdue balances. Great for identifying defaulters or checking collection rates.',
    parameters: [
      { name: 'classId', type: 'string', description: 'Filter by class ID (use list_classes first to get IDs)' },
      { name: 'className', type: 'string', description: 'Filter by class name (e.g. "Grade 1", "10A")' },
      { name: 'onlyWithBalance', type: 'string', description: 'Set to "true" to show only students with outstanding balances', enum: ['true', 'false'] },
      { name: 'limit', type: 'number', description: 'Max students to return (default 30)' },
    ],
    execute: async (params) => {
      const studentWhere: any = { status: 'ACTIVE' };
      if (params.classId) studentWhere.classId = params.classId;
      if (params.className) {
        studentWhere.class = { name: { contains: params.className, mode: 'insensitive' } };
      }

      const students = await prisma.student.findMany({
        where: studentWhere,
        include: {
          class: { select: { name: true } },
          feeStructures: {
            include: { feeTemplate: { select: { name: true } } },
          },
        },
        orderBy: [{ firstName: 'asc' }],
        take: params.limit || 30,
      });

      const results = students.map(s => {
        const fees = s.feeStructures.map(f => ({
          feeItem: f.feeTemplate.name,
          amountDue: Number(f.amountDue),
          amountPaid: Number(f.amountPaid),
          balance: Number(f.amountDue) - Number(f.amountPaid),
        }));
        const totalDue = fees.reduce((sum, f) => sum + f.amountDue, 0);
        const totalPaid = fees.reduce((sum, f) => sum + f.amountPaid, 0);
        return {
          name: `${s.firstName} ${s.lastName}`,
          admissionNumber: s.admissionNumber,
          class: s.class?.name || 'N/A',
          totalDue,
          totalPaid,
          outstandingBalance: totalDue - totalPaid,
          percentagePaid: totalDue > 0 ? `${((totalPaid / totalDue) * 100).toFixed(0)}%` : 'N/A',
          fees,
        };
      });

      const filtered = params.onlyWithBalance === 'true'
        ? results.filter(r => r.outstandingBalance > 0)
        : results;

      const totalStudents = filtered.length;
      const totalDueAll = filtered.reduce((s, r) => s + r.totalDue, 0);
      const totalPaidAll = filtered.reduce((s, r) => s + r.totalPaid, 0);
      const totalOutstanding = totalDueAll - totalPaidAll;
      const studentsFullyPaid = filtered.filter(r => r.outstandingBalance <= 0).length;
      const studentsWithBalance = filtered.filter(r => r.outstandingBalance > 0).length;

      return {
        summary: {
          totalStudents,
          studentsFullyPaid,
          studentsWithBalance,
          totalFeesDue: totalDueAll,
          totalCollected: totalPaidAll,
          totalOutstanding,
          collectionRate: totalDueAll > 0 ? `${((totalPaidAll / totalDueAll) * 100).toFixed(1)}%` : 'N/A',
        },
        students: filtered,
      };
    },
  },

  {
    name: 'get_invoice_summary',
    description: 'Get a summary of all invoices — counts and totals by status (DRAFT/SENT/PARTIALLY_PAID/PAID/OVERDUE/CANCELLED), overdue invoices, and recent invoice activity. Useful for accounts receivable reporting.',
    parameters: [
      { name: 'status', type: 'string', description: 'Filter by invoice status', enum: ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'CREDITED'] },
      { name: 'startDate', type: 'string', description: 'Filter from issue date (YYYY-MM-DD)' },
      { name: 'endDate', type: 'string', description: 'Filter to issue date (YYYY-MM-DD)' },
      { name: 'studentQuery', type: 'string', description: 'Search by student name or admission number' },
      { name: 'limit', type: 'number', description: 'Max invoices to return (default 20)' },
    ],
    execute: async (params) => {
      const where: any = {};
      if (params.status) where.status = params.status;
      if (params.startDate || params.endDate) {
        where.issueDate = {};
        if (params.startDate) where.issueDate.gte = new Date(params.startDate);
        if (params.endDate) where.issueDate.lte = new Date(params.endDate + 'T23:59:59');
      }
      if (params.studentQuery) {
        where.student = {
          OR: [
            { firstName: { contains: params.studentQuery, mode: 'insensitive' } },
            { lastName: { contains: params.studentQuery, mode: 'insensitive' } },
            { admissionNumber: { contains: params.studentQuery, mode: 'insensitive' } },
          ],
        };
      }

      // Status breakdown (overall)
      const statusBreakdown = await prisma.invoice.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { totalAmount: true, amountPaid: true, balanceDue: true },
      });

      // Overdue invoices
      const overdueCount = await prisma.invoice.count({
        where: { status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { lt: new Date() } },
      });

      // Filtered invoices list
      const invoices = await prisma.invoice.findMany({
        where,
        include: {
          student: { select: { firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } } },
          items: { select: { description: true, amount: true } },
        },
        orderBy: { issueDate: 'desc' },
        take: params.limit || 20,
      });

      return {
        overview: {
          byStatus: statusBreakdown.map(s => ({
            status: s.status,
            count: s._count.id,
            totalAmount: Number(s._sum.totalAmount || 0),
            amountPaid: Number(s._sum.amountPaid || 0),
            balanceDue: Number(s._sum.balanceDue || 0),
          })),
          overdueInvoices: overdueCount,
        },
        invoices: invoices.map(inv => ({
          invoiceNumber: inv.invoiceNumber,
          student: `${inv.student.firstName} ${inv.student.lastName} (${inv.student.admissionNumber})`,
          class: inv.student.class?.name || 'N/A',
          issueDate: inv.issueDate.toISOString().split('T')[0],
          dueDate: inv.dueDate.toISOString().split('T')[0],
          totalAmount: Number(inv.totalAmount),
          amountPaid: Number(inv.amountPaid),
          balanceDue: Number(inv.balanceDue),
          status: inv.status,
          items: inv.items.map(i => `${i.description} (K${Number(i.amount)})`).join(', '),
        })),
      };
    },
  },
];

// ==========================
// BUILD TOOL DESCRIPTIONS FOR AI
// ==========================
function buildToolDescriptions(): string {
  return tools.map(t => {
    const params = t.parameters.length > 0
      ? '\n    Parameters:\n' + t.parameters.map(p =>
        `      - ${p.name} (${p.type}${p.required ? ', required' : ''}): ${p.description}${p.enum ? ` [${p.enum.join(', ')}]` : ''}`
      ).join('\n')
      : '\n    Parameters: none';
    return `  ${t.name}: ${t.description}${params}`;
  }).join('\n\n');
}

// ==========================
// FRIENDLY TOOL NAME MAP
// ==========================
const toolFriendlyNames: Record<string, string> = {
  add_calendar_events: 'Calendar Events',
  list_calendar_events: 'Calendar Events',
  delete_calendar_events: 'Calendar Events',
  create_students: 'Students',
  search_students: 'Student Search',
  create_classes: 'Classes',
  list_classes: 'Classes',
  create_subjects: 'Subjects',
  list_subjects: 'Subjects',
  list_lesson_plans: 'Lesson Plans',
  get_lesson_plan_content: 'Lesson Plan',
  create_fee_templates: 'Fee Templates',
  list_fee_templates: 'Fee Templates',
  create_academic_terms: 'Academic Terms',
  list_academic_terms: 'Academic Terms',
  create_assessments: 'Assessments',
  create_timetable_periods: 'Timetable',
  list_users: 'Users',
  create_announcements: 'Announcements',
  send_notifications: 'Notifications',
  get_school_statistics: 'School Overview',
  create_scholarships: 'Scholarships',
  create_expenses: 'Expenses',
  assign_subjects_to_classes: 'Subject Assignments',
  cleanup_class_subjects: 'Subject Assignment Cleanup',
  list_topics: 'Syllabus Topics',
  generate_syllabus: 'AI Syllabus Generator',
  generate_lesson_plans: 'AI Lesson Plan Generator',
  generate_assessments: 'AI Assessment Generator',
  generate_homework: 'AI Homework Generator',
  populate_all_syllabi: 'Bulk Syllabus Generator',
  check_syllabus_progress: 'Syllabus Progress',
  cleanup_invalid_syllabi: 'Syllabus Cleanup',
  create_topics: 'Syllabus Topics',
  delete_topics: 'Syllabus Topics',
  search_payments: 'Payment Transactions',
  get_payment_analytics: 'Payment Analytics',
  get_student_payment_history: 'Student Payment History',
  get_student_fee_balances: 'Student Fee Balances',
  get_invoice_summary: 'Invoice Summary',
};

// ==========================
// SYSTEM PROMPT
// ==========================
function buildSystemPrompt(): string {
  const currentYear = new Date().getFullYear();
  return `You are Sync Master AI — the intelligent operations assistant for a school management system called Sync.
You can perform real actions across ALL modules: academic calendar, students, classes, subjects, subject-class assignments, syllabus/topics, fees, payment transactions, invoices, financial analytics, assessments, timetables, announcements, expenses, and more.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}
CURRENT YEAR: ${currentYear}

## YOUR PERSONALITY:
- You are helpful, professional, and concise
- Speak naturally like a human assistant — warm but never verbose
- Keep every response SHORT — 1 sentence max for the "message" field
- NEVER narrate what you're about to do ("I'll move fast", "hang tight", "doing it now") — just do it
- NEVER describe your process ("First I'll list classes, then...") — just call the tools
- Be empathetic with errors: "Hmm, I couldn't find that class."

## YOUR CAPABILITIES (TOOLS):
${_cachedToolDescriptions || buildToolDescriptions()}

## RULES:
1. When the user asks you to DO something (create, add, delete, etc.), you MUST respond with a JSON action plan.
2. For data that requires knowledge (like holidays by country), use your training data to generate accurate information.
3. Always use the correct eventType, date formats (YYYY-MM-DD), and enum values.
4. When creating bulk items, generate all items in a single tool call.
5. If you need IDs (classId, subjectId, etc.) that you don't have, prefer using name/code parameters (subjectCode, subjectName, className) which most tools support. Only call list tools if no name/code alternative exists.
6. Be helpful and proactive — suggest related actions after completing a task.
7. **CRITICAL — PRECISION**: Only call the tools that directly answer what the user asked. Do NOT call extra tools. If the user asks "how many students", ONLY call get_school_statistics — do NOT list all classes or subjects unless they asked.
8. Only use the MINIMUM set of tools needed to answer the user's exact question.
9. **SYLLABUS WORKFLOW**: When asked to populate/generate syllabus for ALL subjects or "everything", use populate_all_syllabi — it starts a background job and returns immediately. Then suggest the user ask "check syllabus progress" to monitor. When asked for a SPECIFIC subject, call generate_syllabus with subjectCode and gradeLevel (one per grade level). When asked "how is the syllabus going" or "check progress", use check_syllabus_progress. The system automatically validates that subjects are appropriate for each grade level (e.g. Additional Mathematics is only for Grade 10-12, not ECE). If the user reports wrong subjects at wrong grades, use cleanup_invalid_syllabi to find and fix them. Do NOT call list_subjects first — tools resolve codes internally. When asked to assign subjects to classes, use assign_subjects_to_classes with assignAll="true" to assign all subjects to all classes, or provide className + subjectCodes for specific assignments. NEVER call list_classes or list_subjects before assign_subjects_to_classes — it resolves everything internally.
10. **GRADE LEVELS**: ECE grades are -3 (Baby Class), -2 (Middle Class), -1 (Top Class), 0 (Reception). Primary is 1-7. Secondary is 8-12.
11. **NO LAZY RESPONSES**: NEVER respond with just a list tool and a suggestion to "do more later". If the user asked you to CREATE or GENERATE something, actually call the creation/generation tool. Do not defer work to follow-up messages.
12. **USE CODES NOT IDS**: When you know the subject name (e.g. "Mathematics"), use subjectCode (e.g. "MATH") or subjectName directly. Do NOT call list_subjects just to get an ID — the tools resolve codes internally.
13. **CURRICULUM CONTENT**: After syllabus is populated, use generate_lesson_plans, generate_assessments, and generate_homework to create teaching content. These tools work per subject+grade — they auto-resolve class and term. When asked to "add everything" or "populate all content" for a subject, call all three. Example: for "Add lesson plans, tests, and homework for Math Grade 3", call generate_lesson_plans, generate_assessments, and generate_homework each with subjectCode=MATH gradeLevel=3.

## RESPONSE FORMAT:
Always respond with ONLY this JSON — nothing else:
{
  "message": "<1 sentence, max 15 words>",
  "actions": [
    { "tool": "tool_name", "params": { ... } }
  ],
  "suggestions": ["Optional short follow-up"]
}

## CRITICAL RULES FOR "message":
- The "message" field is a PLACEHOLDER — the system replaces it with a data-driven summary after tools run.
- So keep it EXTREMELY short: a natural spoken filler like "Checking that now." or "Let me look that up."
- Write it as something a human assistant would say OUT LOUD while working — warm, brief, conversational.
- NEVER include: emojis, commentary, narration, process descriptions, or filler phrases that mention tools.
- NEVER repeat the JSON structure or action details inside the message.
- BAD: "Got it — doing it now 👍 I'll move fast and sample one student..."
- GOOD: "Let me check the records."
- GOOD: "Pulling that up now."
- GOOD: "One moment."
- If no actions needed, answer the question directly and concisely in 1-3 sentences.

IMPORTANT: Respond ONLY with valid JSON. No markdown wrapping, no text outside the JSON.`;
}

// ==========================
// CLEAN UP LEAKED JSON / VERBOSE FILLER
// ==========================
function cleanFinalMessage(message: string): string {
  let cleaned = message.trim();

  // Strip any JSON blocks that leaked into the message
  cleaned = cleaned.replace(/```json[\s\S]*?```/g, '').trim();
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '').trim();

  // Remove standalone JSON objects (e.g. { "message": ..., "actions": ... })
  cleaned = cleaned.replace(/\{\s*"message"\s*:[\s\S]*?\}\s*$/, '').trim();
  cleaned = cleaned.replace(/\{\s*"actions"\s*:[\s\S]*?\}\s*$/, '').trim();

  // If the entire message looks like JSON, extract just the message field
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed.message && typeof parsed.message === 'string') {
        cleaned = parsed.message;
      }
    } catch {
      // Not valid JSON, keep as-is
    }
  }

  // Remove excessive emojis (keep max 2)
  // Use surrogate pair ranges compatible with es2016 (no /u flag)
  const emojiPattern = /(?:\uD83D[\uDE00-\uDEFF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDE80-\uDEFF]|[\u2600-\u26FF]|[\u2700-\u27BF]|\uD83E[\uDD00-\uDDFF])/g;
  const emojis = cleaned.match(emojiPattern) || [];
  if (emojis.length > 2) {
    let count = 0;
    cleaned = cleaned.replace(emojiPattern, (match) => {
      count++;
      return count <= 2 ? match : '';
    });
  }

  // Collapse extra whitespace
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned || message;
}

// ==========================
// MAIN EXECUTION ENGINE
// ==========================
class MasterAIService {

  /**
   * Process a natural language command and execute the resulting actions
   */
  async processCommand(userMessage: string, userId: string, conversationHistory?: { role: string; content: string }[], imageBase64?: string): Promise<MasterAIResponse> {
    // Build messages with cached system prompt & sanitized history
    const messages: { role: 'system' | 'user' | 'assistant'; content: string; image?: string }[] = [
      { role: 'system', content: getCachedSystemPrompt() },
    ];

    // Add sanitized conversation history (truncates assistant msgs, strips PII)
    if (conversationHistory?.length) {
      for (const msg of sanitizeConversationHistory(conversationHistory)) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    messages.push({ role: 'user', content: userMessage, ...(imageBase64 && { image: imageBase64 }) });

    // Call AI to get the action plan
    const aiResponse = await aiService.chat(messages, {
      temperature: 0.3,
      maxTokens: 2000,
    });

    // Parse the AI response
    let plan: { message: string; actions: { tool: string; params: Record<string, any> }[]; suggestions?: string[] };

    try {
      let cleaned = aiResponse.content.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();
      plan = JSON.parse(cleaned);
    } catch (parseError) {
      return { message: aiResponse.content, actions: [], suggestions: [] };
    }

    // ---- GUARD: Rate-limit actions per request ----
    if ((plan.actions || []).length > MAX_ACTIONS_PER_REQUEST) {
      return {
        message: `That request would trigger ${plan.actions.length} operations, which exceeds the limit of ${MAX_ACTIONS_PER_REQUEST}. Please break it into smaller requests.`,
        actions: [],
        suggestions: ['Try one subject at a time', 'Split by grade level'],
      };
    }

    // ---- Execute actions in parallel with validation & timeout ----
    const results = await this.executeToolActions(plan.actions || [], userId);

    // ---- POST-EXECUTION: Smart summarizer (skip extra AI call when possible) ----
    let finalMessage = plan.message;
    const successResults = results.filter(r => r.success);
    const needsSummarizer = successResults.length > 0 && (
      successResults.some(r => r.data && (Array.isArray(r.data) ? r.data.length > 0 : Object.keys(r.data || {}).length > 2))
    );
    if (needsSummarizer) {
      try {
        finalMessage = await this.buildAccurateSummary(userMessage, results, plan.message);
      } catch { /* fallback */ }
    } else if (results.length > 0) {
      finalMessage = results.map(r => r.summary).join('. ') + '.';
    }

    // Log usage (non-critical)
    try {
      await prisma.aIUsageLog.create({
        data: {
          userId,
          feature: 'master-ai-ops',
          action: 'execute-command',
          tokensUsed: aiResponse.tokensUsed || 0,
          metadata: {
            userMessage,
            toolsCalled: results.map(r => r.tool),
            successCount: successResults.length,
            failureCount: results.filter(r => !r.success).length,
          } as any,
        },
      });
    } catch { /* non-critical */ }

    return {
      message: cleanFinalMessage(finalMessage),
      actions: results,
      suggestions: plan.suggestions,
    };
  }

  /**
   * Shared tool execution engine — validates params, runs in parallel with timeouts.
   */
  private async executeToolActions(actions: { tool: string; params: Record<string, any> }[], userId: string): Promise<ExecutionResult[]> {
    const executeOne = async (action: { tool: string; params: Record<string, any> }): Promise<ExecutionResult> => {
      const toolDef = tools.find(t => t.name === action.tool);
      if (!toolDef) {
        return { tool: action.tool, success: false, error: `Unknown tool: ${action.tool}`, summary: `Failed: unknown tool "${action.tool}"` };
      }

      // Validate params with Zod
      const validation = validateToolParams(action.tool, action.params || {});
      if (!validation.valid) {
        const friendlyName = toolFriendlyNames[toolDef.name] || toolDef.name;
        return { tool: action.tool, success: false, error: validation.error, summary: `${friendlyName} — ${validation.error}` };
      }

      try {
        const timeoutMs = LONG_RUNNING_TOOLS.has(action.tool) ? TOOL_TIMEOUT_LONG_MS : TOOL_TIMEOUT_MS;
        const data = await withTimeout(toolDef.execute(validation.sanitized, userId), timeoutMs, action.tool);
        const friendlyName = toolFriendlyNames[toolDef.name] || toolDef.name;
        let summaryText: string;
        if (data?.summary && typeof data.summary === 'string') {
          const hasErrors = data.errors?.length > 0;
          summaryText = `${friendlyName} — ${data.summary}`;
          if (hasErrors) summaryText += ` (${data.errors.length} issue${data.errors.length > 1 ? 's' : ''} encountered)`;
        } else if (Array.isArray(data)) {
          summaryText = `${friendlyName} — ${data.length} item${data.length !== 1 ? 's' : ''} found`;
        } else {
          const count = data?.deleted ?? 1;
          summaryText = `${friendlyName} — ${count} item${count !== 1 ? 's' : ''} processed`;
        }
        return { tool: action.tool, success: true, data, summary: summaryText };
      } catch (execError: any) {
        const friendlyName = toolFriendlyNames[toolDef.name] || toolDef.name;
        return { tool: action.tool, success: false, error: execError.message, summary: `${friendlyName} — Could not complete this action` };
      }
    };

    // Run all actions in parallel (independent of each other)
    const settled = await Promise.allSettled(actions.map(a => executeOne(a)));
    return settled.map((result, i) => {
      if (result.status === 'fulfilled') return result.value;
      return { tool: actions[i].tool, success: false, error: result.reason?.message || 'Unknown error', summary: `Failed: ${result.reason?.message}` };
    });
  }

  /**
   * Build an accurate, human-readable summary from actual tool execution results.
   * Uses a lightweight AI call to turn raw data into a precise conversational answer.
   */
  private async buildAccurateSummary(userMessage: string, results: ExecutionResult[], fallbackMessage: string): Promise<string> {
    // If no successful actions, just return the fallback
    const successResults = results.filter(r => r.success);
    if (successResults.length === 0) {
      const failedResults = results.filter(r => !r.success);
      if (failedResults.length > 0) {
        return `I wasn't able to complete that — ${failedResults.map(r => r.error || 'an error occurred').join('; ')}. Please try again or rephrase your request.`;
      }
      return fallbackMessage;
    }

    // Build a compact data snapshot for the summarizer
    const dataSnapshot = successResults.map(r => {
      const friendlyName = toolFriendlyNames[r.tool] || r.tool;
      let compactData: any = r.data;

      // Trim large arrays to keep token usage low
      if (compactData?.created && Array.isArray(compactData.created)) {
        compactData = {
          ...compactData,
          created: compactData.created.slice(0, 5).map((item: any) => {
            const { id, schoolId, createdAt, updatedAt, ...rest } = item;
            return rest;
          }),
          _totalCreated: compactData.created.length,
        };
      }
      if (Array.isArray(compactData) && compactData.length > 10) {
        compactData = { items: compactData.slice(0, 5).map((item: any) => {
          const { id, schoolId, createdAt, updatedAt, ...rest } = item;
          return rest;
        }), _totalCount: compactData.length };
      }
      // Strip IDs from plain objects
      if (compactData && typeof compactData === 'object' && !Array.isArray(compactData)) {
        const { id, schoolId, createdAt, updatedAt, ...rest } = compactData;
        if (Object.keys(rest).length > 0 && Object.keys(rest).length < 20) {
          compactData = rest;
        }
      }

      return { tool: friendlyName, data: compactData };
    });

    const failedResults = results.filter(r => !r.success);

    const summarizerPrompt = `You are a school management assistant. The user asked: "${userMessage}"

Here are the ACTUAL results from the system:
${JSON.stringify(dataSnapshot, null, 2)}
${failedResults.length > 0 ? `\nSome actions failed: ${failedResults.map(r => r.summary).join('; ')}` : ''}

Write a SHORT, PRECISE answer (2-4 sentences max) using the REAL data above.

RULES:
- Be SPECIFIC — use exact numbers, names, and values from the data.
- Answer ONLY what was asked — don't dump extra information.
- Write in plain English for a non-technical school admin.
- Use at most 1 emoji, only if natural.
- Do NOT use bullet points, lists, or markdown formatting.
- Do NOT narrate your process ("I looked up...", "I found...") — just state the answer.
- Do NOT mention tools, databases, APIs, JSON, or technical terms.
- Do NOT include any JSON in your response.
- Respond with ONLY the answer text, nothing else.`;

    try {
      const summaryResponse = await aiService.chat([
        { role: 'user', content: summarizerPrompt },
      ], {
        temperature: 0.2,
        maxTokens: 150,
      });
      const cleaned = summaryResponse.content.trim();
      // Sanity check: if AI returned something useful
      if (cleaned.length > 10 && cleaned.length < 1000) {
        return cleaned;
      }
    } catch {
      // Fall through to fallback
    }

    return fallbackMessage;
  }

  /**
   * Get available tool names and descriptions (for the frontend)
   */
  getAvailableTools(): { name: string; description: string }[] {
    return tools.map(t => ({ name: t.name, description: t.description }));
  }

  /**
   * Streaming two-phase command execution (ElevenLabs-inspired pipeline).
   *
   * Phase 1 ("quick"): AI generates the plan → immediately yields the
   *   plan.message so the frontend can start TTS while tools execute.
   * Phase 2 ("result"): Tools finish + summarizer runs → yields the
   *   final data-driven answer.
   *
   * For simple conversational queries (no tools), there's only one
   * phase — "result" fires immediately.
   */
  async processCommandStreaming(
    userMessage: string,
    userId: string,
    onPhase: (phase: 'quick' | 'result', data: Partial<MasterAIResponse>) => void,
    conversationHistory?: { role: string; content: string }[],
    imageBase64?: string,
  ): Promise<MasterAIResponse> {
    // Build messages with cached prompt & sanitized history
    const messages: { role: 'system' | 'user' | 'assistant'; content: string; image?: string }[] = [
      { role: 'system', content: getCachedSystemPrompt() },
    ];

    if (conversationHistory?.length) {
      for (const msg of sanitizeConversationHistory(conversationHistory, 6)) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    messages.push({ role: 'user', content: userMessage, ...(imageBase64 && { image: imageBase64 }) });

    // ---- Phase 1: AI planning call ----
    const aiResponse = await aiService.chat(messages, {
      temperature: 0.3,
      maxTokens: 800,
    });

    let plan: { message: string; actions: { tool: string; params: Record<string, any> }[]; suggestions?: string[] };

    try {
      let cleaned = aiResponse.content.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();
      plan = JSON.parse(cleaned);
    } catch {
      const result: MasterAIResponse = { message: aiResponse.content, actions: [], suggestions: [] };
      onPhase('result', result);
      return result;
    }

    const hasActions = (plan.actions || []).length > 0;

    // Rate-limit guard
    if ((plan.actions || []).length > MAX_ACTIONS_PER_REQUEST) {
      const result: MasterAIResponse = {
        message: `That request would trigger ${plan.actions.length} operations (limit: ${MAX_ACTIONS_PER_REQUEST}). Please break it into smaller requests.`,
        actions: [],
        suggestions: ['Try one subject at a time'],
      };
      onPhase('result', result);
      return result;
    }

    // Send spoken filler immediately while tools execute
    if (hasActions && plan.message) {
      onPhase('quick', { message: cleanFinalMessage(plan.message) });
    }

    // ---- Phase 2: Execute tools (parallel, validated, with timeout) ----
    const results = await this.executeToolActions(plan.actions || [], userId);

    // Build accurate summary — skip the extra LLM call for simple cases
    let finalMessage = plan.message;
    const successResults = results.filter(r => r.success);
    const needsSummarizer = successResults.length > 0 && (
      successResults.some(r => r.data && (Array.isArray(r.data) ? r.data.length > 0 : Object.keys(r.data || {}).length > 2))
    );
    if (needsSummarizer) {
      try {
        finalMessage = await this.buildAccurateSummary(userMessage, results, plan.message);
      } catch { /* fallback */ }
    } else if (results.length > 0) {
      finalMessage = results.map(r => r.summary).join('. ') + '.';
    }

    // Log usage (non-critical)
    try {
      await prisma.aIUsageLog.create({
        data: {
          userId,
          feature: 'master-ai-ops',
          action: 'execute-command',
          tokensUsed: aiResponse.tokensUsed || 0,
          metadata: {
            userMessage,
            toolsCalled: results.map(r => r.tool),
            successCount: successResults.length,
            failureCount: results.filter(r => !r.success).length,
          } as any,
        },
      });
    } catch { /* non-critical */ }

    const fullResult: MasterAIResponse = {
      message: cleanFinalMessage(finalMessage),
      actions: results,
      suggestions: plan.suggestions,
    };

    onPhase('result', fullResult);
    return fullResult;
  }
}

export const masterAIService = new MasterAIService();
