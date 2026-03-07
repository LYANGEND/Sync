import { prisma } from '../utils/prisma';
import aiService from './aiService';
import { Prisma } from '@prisma/client';

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
    description: 'Create one or more classes/grades. Requires a teacherId and academicTermId. Use list_users to find teacher IDs and list_academic_terms to find term IDs first.',
    parameters: [
      { name: 'classes', type: 'array', description: 'Array of class objects: name, gradeLevel (number), teacherId (string), academicTermId (string)', required: true },
    ],
    execute: async (params) => {
      const classes = params.classes as any[];
      // If no teacherId/academicTermId provided, try to find defaults
      let defaultTeacherId = params.classes?.[0]?.teacherId;
      let defaultTermId = params.classes?.[0]?.academicTermId;
      if (!defaultTeacherId) {
        const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
        defaultTeacherId = admin?.id;
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
    description: 'Assign (connect) one or more subjects to one or more classes. Use list_classes and list_subjects first to get IDs or names. You can match by className or classId, and subjectCode or subjectId.',
    parameters: [
      { name: 'assignments', type: 'array', description: 'Array of { className (string, optional), classId (string, optional), subjectCodes (string[], optional), subjectIds (string[], optional) }. Each entry connects the specified subjects to the class.', required: true },
    ],
    execute: async (params) => {
      const assignments = params.assignments as any[];
      const connected: string[] = [];
      const alreadyLinked: string[] = [];
      const errors: string[] = [];

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
              if (sub) subjectIds.push(sub.id);
              else errors.push(`Subject code "${code}" not found`);
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
      return { connected, alreadyLinked, errors, summary: `${connected.length} class(es) updated, ${alreadyLinked.length} already linked, ${errors.length} issues` };
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

      const prompt = `You are a Zambian curriculum expert. Generate a comprehensive syllabus for:

SUBJECT: ${subjectInfo.name} (${subjectInfo.code})
LEVEL: ${levelDesc}
COUNTRY: Zambia

Generate topics and subtopics following the official Zambian curriculum framework (CDC — Curriculum Development Centre).
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
  list_topics: 'Syllabus Topics',
  generate_syllabus: 'AI Syllabus Generator',
  create_topics: 'Syllabus Topics',
  delete_topics: 'Syllabus Topics',
};

// ==========================
// SYSTEM PROMPT
// ==========================
function buildSystemPrompt(): string {
  const currentYear = new Date().getFullYear();
  return `You are Sync Master AI — the intelligent operations assistant for a school management system called Sync.
You can perform real actions across ALL modules: academic calendar, students, classes, subjects, subject-class assignments, syllabus/topics, fees, assessments, timetables, announcements, expenses, and more.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}
CURRENT YEAR: ${currentYear}

## YOUR CAPABILITIES (TOOLS):
${buildToolDescriptions()}

## RULES:
1. When the user asks you to DO something (create, add, delete, etc.), you MUST respond with a JSON action plan.
2. For data that requires knowledge (like holidays by country), use your training data to generate accurate information.
3. Always use the correct eventType, date formats (YYYY-MM-DD), and enum values.
4. When creating bulk items, generate all items in a single tool call.
5. If you need IDs (classId, subjectId, etc.) that you don't have, first call the relevant list tool to find them.
6. Be helpful and proactive — suggest related actions after completing a task.
7. **CRITICAL — PRECISION**: Only call the tools that directly answer what the user asked. Do NOT call extra tools. If the user asks "how many students", ONLY call get_school_statistics — do NOT list all classes or subjects unless they asked.
8. Only use the MINIMUM set of tools needed to answer the user's exact question.
9. **SYLLABUS WORKFLOW**: When asked to seed/generate topics or syllabus for a subject, use generate_syllabus (AI-powered). When asked to assign subjects to classes, use assign_subjects_to_classes. Always list_subjects and list_classes first if you need IDs.
10. **GRADE LEVELS**: ECE grades are -3 (Baby Class), -2 (Middle Class), -1 (Top Class), 0 (Reception). Primary is 1-7. Secondary is 8-12.

## RESPONSE FORMAT:
Always respond with valid JSON in this exact format:
{
  "message": "A brief, friendly note about what you are about to do. Keep it to ONE short sentence.",
  "actions": [
    {
      "tool": "tool_name",
      "params": { ... parameters for the tool ... }
    }
  ],
  "suggestions": ["Optional follow-up suggestions in plain English"]
}

NOTE: After actions execute, the system will automatically generate a detailed, accurate summary using the real data. Your "message" field is just a quick intent note — the system handles the final conversational answer.

If the user asks a question that doesn't require an action, still use the JSON format but with an empty actions array, and provide a helpful conversational answer in the message.
If you need to call multiple tools (e.g., list classes first, then create assessments), include all actions in order.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation outside the JSON.`;
}

// ==========================
// MAIN EXECUTION ENGINE
// ==========================
class MasterAIService {

  /**
   * Process a natural language command and execute the resulting actions
   */
  async processCommand(userMessage: string, userId: string, conversationHistory?: { role: string; content: string }[]): Promise<MasterAIResponse> {
    // Build messages
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: buildSystemPrompt() },
    ];

    // Add conversation history if provided
    if (conversationHistory?.length) {
      for (const msg of conversationHistory.slice(-10)) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    messages.push({ role: 'user', content: userMessage });

    // Call AI to get the action plan
    const aiResponse = await aiService.chat(messages, {
      temperature: 0.3,
      maxTokens: 4000,
    });

    // Parse the AI response
    let plan: { message: string; actions: { tool: string; params: Record<string, any> }[]; suggestions?: string[] };

    try {
      // Clean up response — remove markdown code fences if present
      let cleaned = aiResponse.content.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      plan = JSON.parse(cleaned);
    } catch (parseError) {
      // If AI didn't return valid JSON, wrap its response
      return {
        message: aiResponse.content,
        actions: [],
        suggestions: [],
      };
    }

    // Execute each action
    const results: ExecutionResult[] = [];

    for (const action of (plan.actions || [])) {
      const toolDef = tools.find(t => t.name === action.tool);

      if (!toolDef) {
        results.push({
          tool: action.tool,
          success: false,
          error: `Unknown tool: ${action.tool}`,
          summary: `Failed: unknown tool "${action.tool}"`,
        });
        continue;
      }

      try {
        const data = await toolDef.execute(action.params || {}, userId);
        // Handle new return format with summary, or legacy array format
        const friendlyName = toolFriendlyNames[toolDef.name] || toolDef.name;
        let summaryText: string;
        if (data?.summary && typeof data.summary === 'string') {
          // New resilient format: { created: [], updated?: [], existing?: [], errors: [], summary: string }
          const hasErrors = data.errors?.length > 0;
          summaryText = `${friendlyName} — ${data.summary}`;
          if (hasErrors) {
            summaryText += ` (${data.errors.length} issue${data.errors.length > 1 ? 's' : ''} encountered)`;
          }
        } else if (Array.isArray(data)) {
          summaryText = `${friendlyName} — ${data.length} item${data.length !== 1 ? 's' : ''} found`;
        } else {
          const count = data?.deleted ?? 1;
          summaryText = `${friendlyName} — ${count} item${count !== 1 ? 's' : ''} processed`;
        }
        results.push({
          tool: action.tool,
          success: true,
          data,
          summary: summaryText,
        });
      } catch (execError: any) {
        const friendlyName = toolFriendlyNames[toolDef.name] || toolDef.name;
        results.push({
          tool: action.tool,
          success: false,
          error: execError.message,
          summary: `${friendlyName} — Could not complete this action`,
        });
      }
    }

    // ---- POST-EXECUTION: Build accurate, data-driven response ----
    let finalMessage = plan.message;
    try {
      finalMessage = await this.buildAccurateSummary(userMessage, results, plan.message);
    } catch {
      // Fall back to AI's pre-execution message
    }

    // Log usage
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
            successCount: results.filter(r => r.success).length,
            failureCount: results.filter(r => !r.success).length,
          } as any,
        },
      });
    } catch {
      // Non-critical
    }

    return {
      message: finalMessage,
      actions: results,
      suggestions: plan.suggestions,
    };
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

    const summarizerPrompt = `You are a friendly school assistant. The user asked: "${userMessage}"

Here are the ACTUAL results from the system:
${JSON.stringify(dataSnapshot, null, 2)}
${failedResults.length > 0 ? `\nSome actions failed: ${failedResults.map(r => r.summary).join('; ')}` : ''}

Write a SHORT, PRECISE, conversational answer (2-4 sentences max) that directly answers what the user asked using the REAL numbers from the data above.

RULES:
- Be SPECIFIC — use exact numbers, names, and values from the data.
- If the user asked about ONE thing (e.g. "how many students"), answer ONLY that — don't dump everything else.
- If data was created, confirm exactly what was created with a count.
- Write in plain English for a non-technical school admin.
- Use 1-2 relevant emojis.
- Do NOT use bullet points or lists — just a natural paragraph.
- Do NOT mention tools, databases, APIs, or technical terms.
- Respond with ONLY the message text, nothing else.`;

    try {
      const summaryResponse = await aiService.chat([
        { role: 'user', content: summarizerPrompt },
      ], {
        temperature: 0.4,
        maxTokens: 300,
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
}

export const masterAIService = new MasterAIService();
