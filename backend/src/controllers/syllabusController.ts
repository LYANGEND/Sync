import { Request, Response } from 'express';
import { TopicStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import aiService from '../services/aiService';
import { buildRuntimeLessonPlanFromTopic } from '../services/lessonPlanRuntimeService';
import { ingestAllPDFs, getIngestionStatus } from '../services/contentIngestionService';

// ==========================================
// VALIDATION SCHEMAS (DRY — reused across CRUD)
// ==========================================

const createTopicSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  subjectId: z.string().uuid(),
  gradeLevel: z.number().int().min(-3).max(12),
  orderIndex: z.number().int().optional(),
});

const createSubTopicSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  learningObjectives: z.array(z.string()).optional(),
  topicId: z.string().uuid(),
  orderIndex: z.number().int().optional(),
  duration: z.number().int().positive().optional(),
});

const updateTopicProgressSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
});

const createLessonPlanSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  termId: z.string().uuid(),
  weekStartDate: z.string(),
  title: z.string().min(3),
  content: z.string().min(10),
  fileUrl: z.string().url().optional().or(z.literal('')),
});

// ==========================================
// HELPER: Safe handler wrapper (DRY error handling)
// ==========================================
function handler(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      console.error(`[Syllabus] ${fn.name || 'handler'} error:`, error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

// ==========================================
// SYLLABUS OVERVIEW (subject-level stats)
// ==========================================

export const getSyllabusOverview = handler(async (req, res) => {
  const subjects = await prisma.subject.findMany({
    orderBy: { name: 'asc' },
    include: {
      topics: {
        select: { id: true, gradeLevel: true, _count: { select: { subtopics: true } } },
      },
    },
  });

  const overview = subjects
    .filter(s => s.topics.length > 0)
    .map(s => {
      const gradeLevels = [...new Set(s.topics.map(t => t.gradeLevel))].sort((a, b) => a - b);
      const totalTopics = s.topics.length;
      const totalSubTopics = s.topics.reduce((sum, t) => sum + t._count.subtopics, 0);

      const byGrade = gradeLevels.map(gl => ({
        gradeLevel: gl,
        topicCount: s.topics.filter(t => t.gradeLevel === gl).length,
        subtopicCount: s.topics.filter(t => t.gradeLevel === gl).reduce((sum, t) => sum + t._count.subtopics, 0),
      }));

      return {
        id: s.id,
        name: s.name,
        code: s.code,
        totalTopics,
        totalSubTopics,
        gradeLevels,
        byGrade,
      };
    });

  res.json(overview);
});

// ==========================================
// TOPICS
// ==========================================

export const getTopics = handler(async (req, res) => {
  const { subjectId, gradeLevel } = req.query;

  if (!subjectId || !gradeLevel) {
    return res.status(400).json({ message: 'Subject ID and Grade Level are required' });
  }

  const topics = await prisma.topic.findMany({
    where: {
      subjectId: subjectId as string,
      gradeLevel: Number(gradeLevel),
    },
    orderBy: { orderIndex: 'asc' },
    include: {
      subtopics: { orderBy: { orderIndex: 'asc' } },
      _count: { select: { subtopics: true } },
    },
  });

  res.json(topics);
});

export const createTopic = handler(async (req, res) => {
  const data = createTopicSchema.parse(req.body);
  const topic = await prisma.topic.create({ data });
  res.status(201).json(topic);
});

export const updateTopic = handler(async (req, res) => {
  const { id } = req.params;
  const data = createTopicSchema.partial().parse(req.body);
  const topic = await prisma.topic.update({ where: { id }, data });
  res.json(topic);
});

export const deleteTopic = handler(async (req, res) => {
  const { id } = req.params;
  await prisma.topic.delete({ where: { id } });
  res.status(204).send();
});

// ==========================================
// SUBTOPICS
// ==========================================

export const getSubTopics = handler(async (req, res) => {
  const { topicId } = req.query;

  if (!topicId) {
    return res.status(400).json({ message: 'Topic ID is required' });
  }

  const subtopics = await prisma.subTopic.findMany({
    where: { topicId: topicId as string },
    orderBy: { orderIndex: 'asc' },
  });

  res.json(subtopics);
});

export const createSubTopic = handler(async (req, res) => {
  const data = createSubTopicSchema.parse(req.body);
  const subtopic = await prisma.subTopic.create({
    data: {
      title: data.title,
      description: data.description || null,
      learningObjectives: data.learningObjectives ? JSON.stringify(data.learningObjectives) : null,
      topicId: data.topicId,
      orderIndex: data.orderIndex || 0,
      duration: data.duration || null,
    },
  });
  res.status(201).json(subtopic);
});

export const updateSubTopic = handler(async (req, res) => {
  const { id } = req.params;
  const data = createSubTopicSchema.partial().parse(req.body);
  const updateData: any = { ...data };
  if (data.learningObjectives) {
    updateData.learningObjectives = JSON.stringify(data.learningObjectives);
  }
  delete updateData.topicId; // Don't allow moving subtopics
  const subtopic = await prisma.subTopic.update({ where: { id }, data: updateData });
  res.json(subtopic);
});

export const deleteSubTopic = handler(async (req, res) => {
  const { id } = req.params;
  await prisma.subTopic.delete({ where: { id } });
  res.status(204).send();
});

// ==========================================
// TOPIC AVAILABILITY (for AI modal)
// ==========================================

export const getTopicAvailability = handler(async (req, res) => {
  const { classId } = req.query;

  if (!classId) {
    return res.status(400).json({ message: 'Class ID is required' });
  }

  const classInfo = await prisma.class.findUnique({ where: { id: classId as string } });
  if (!classInfo) return res.status(404).json({ message: 'Class not found' });

  // Group topics by subject for this grade level
  const grouped = await prisma.topic.groupBy({
    by: ['subjectId'],
    where: { gradeLevel: classInfo.gradeLevel },
    _count: { id: true },
  });

  const subjectIds = grouped.map(g => g.subjectId);
  const subjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true, name: true, code: true },
  });

  const result = subjects.map(s => ({
    ...s,
    topicCount: grouped.find(g => g.subjectId === s.id)?._count?.id || 0,
  })).sort((a, b) => b.topicCount - a.topicCount);

  res.json(result);
});

// ==========================================
// TOPIC PROGRESS
// ==========================================

export const getClassProgress = handler(async (req, res) => {
  const { classId, subjectId } = req.query;

  if (!classId || !subjectId) {
    return res.status(400).json({ message: 'Class ID and Subject ID are required' });
  }

  const classInfo = await prisma.class.findUnique({ where: { id: classId as string } });
  if (!classInfo) return res.status(404).json({ message: 'Class not found' });

  const topics = await prisma.topic.findMany({
    where: {
      subjectId: subjectId as string,
      gradeLevel: classInfo.gradeLevel,
    },
    orderBy: { orderIndex: 'asc' },
    include: {
      subtopics: { orderBy: { orderIndex: 'asc' } },
      progress: { where: { classId: classId as string } },
    },
  });

  const formattedTopics = topics.map(topic => ({
    ...topic,
    status: topic.progress[0]?.status || 'PENDING',
    completedAt: topic.progress[0]?.completedAt || null,
  }));

  res.json(formattedTopics);
});

export const updateTopicProgress = handler(async (req, res) => {
  const { topicId, classId } = req.params;
  const { status } = updateTopicProgressSchema.parse(req.body);

  const progress = await prisma.topicProgress.upsert({
    where: { topicId_classId: { topicId, classId } },
    update: {
      status: status as TopicStatus,
      completedAt: status === 'COMPLETED' ? new Date() : null,
    },
    create: {
      topicId,
      classId,
      status: status as TopicStatus,
      completedAt: status === 'COMPLETED' ? new Date() : null,
    },
  });

  res.json(progress);
});

// ==========================================
// LESSON PLANS
// ==========================================

export const getLessonPlans = handler(async (req, res) => {
  const { classId, subjectId } = req.query;

  if (!classId || !subjectId) {
    return res.status(400).json({ message: 'Class ID and Subject ID are required' });
  }

  const plans = await prisma.lessonPlan.findMany({
    where: { classId: classId as string, subjectId: subjectId as string },
    orderBy: { weekStartDate: 'desc' },
    include: {
      teacher: { select: { fullName: true } },
      subject: { select: { id: true, name: true, code: true } },
      class: { select: { id: true, name: true, gradeLevel: true } },
    },
  });

  res.json(plans);
});

export const createLessonPlan = handler(async (req, res) => {
  const data = createLessonPlanSchema.parse(req.body);
  const userId = (req as any).user?.userId;

  const plan = await prisma.lessonPlan.create({
    data: {
      ...data,
      weekStartDate: new Date(data.weekStartDate),
      teacherId: userId,
    },
  });

  res.status(201).json(plan);
});

export const updateLessonPlan = handler(async (req, res) => {
  const { id } = req.params;
  const data = createLessonPlanSchema.partial().parse(req.body);
  const updateData: any = { ...data };
  if (data.weekStartDate) updateData.weekStartDate = new Date(data.weekStartDate);
  const plan = await prisma.lessonPlan.update({ where: { id }, data: updateData });
  res.json(plan);
});

export const deleteLessonPlan = handler(async (req, res) => {
  const { id } = req.params;
  await prisma.lessonPlan.delete({ where: { id } });
  res.status(204).send();
});

// ==========================================
// SYLLABUS → LESSON PLAN GENERATOR (AI-powered)
// ==========================================

/**
 * POST /api/v1/syllabus/generate-lesson-plan
 * Auto-generate a structured lesson plan from selected topic + subtopics
 */
export const generateLessonPlan = handler(async (req, res) => {
  const { topicId, subTopicIds, subjectId, gradeLevel, durationMinutes } = req.body;

  if (!topicId) return res.status(400).json({ message: 'Topic ID is required' });

  // Fetch topic with subtopics in one query
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      subtopics: {
        where: subTopicIds?.length ? { id: { in: subTopicIds } } : undefined,
        orderBy: { orderIndex: 'asc' },
      },
      subject: { select: { name: true } },
    },
  });

  if (!topic) return res.status(404).json({ message: 'Topic not found' });

  const subjectName = subjectId
    ? (await prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true } }))?.name || topic.subject.name
    : topic.subject.name;

  const duration = durationMinutes || 45;
  const runtimePlan = await buildRuntimeLessonPlanFromTopic({
    title: topic.title,
    subjectName,
    scheduledStart: new Date(),
    scheduledEnd: new Date(Date.now() + duration * 60_000),
    topicId,
    selectedSubTopicIds: subTopicIds,
  });
  const subtopicList = topic.subtopics.map(st => {
    let objectives: string[] = [];
    try { objectives = st.learningObjectives ? JSON.parse(st.learningObjectives) : []; } catch { }
    return {
      title: st.title,
      description: st.description,
      objectives,
      duration: st.duration,
    };
  });

  const prompt = `Generate a structured lesson plan for a teacher to use in a virtual classroom.

SUBJECT: ${subjectName}
GRADE LEVEL: ${gradeLevel || topic.gradeLevel}
TOPIC: ${topic.title}${topic.description ? ` — ${topic.description}` : ''}
DURATION: ${duration} minutes
${subtopicList.length > 0 ? `
SUBTOPICS TO COVER:
${subtopicList.map((st, i) => `${i + 1}. ${st.title}${st.description ? ` — ${st.description}` : ''}${st.objectives.length ? `\n   Objectives: ${st.objectives.join('; ')}` : ''}`).join('\n')}
` : ''}
Generate a lesson plan with these sections:
1. **Introduction** (5 min) — Hook, recap of prior knowledge, today's objectives
2. **Teaching** — Main content broken into clear steps with examples relevant to African/Zambian context
3. **Activity** — A hands-on exercise or group activity for students
4. **Assessment** — 3-5 quick check questions to verify understanding
5. **Wrap-up** — Summary of key points, homework if applicable

Write in clear, teacher-friendly language. Include specific examples, teaching tips, and expected student responses.
Format as a structured text plan that an AI tutor can follow during a live class.`;

  const aiResponse = await aiService.chat([
    { role: 'user', content: prompt },
  ], { temperature: 0.5, maxTokens: 2000 });

  res.json({
    lessonPlan: aiResponse.content,
    structuredLessonPlan: runtimePlan,
    topic: { id: topic.id, title: topic.title },
    subtopics: topic.subtopics.map(st => ({ id: st.id, title: st.title })),
    subjectName,
    gradeLevel: gradeLevel || topic.gradeLevel,
    duration,
  });
});

/**
 * POST /api/v1/syllabus/generate-questions
 * AI-generate assessment questions for a given subject/topic
 */
export const generateQuestions = handler(async (req, res) => {
  const { subjectId, topicId, topicName, questionCount = 5, questionTypes = ['MULTIPLE_CHOICE'], difficulty = 'medium' } = req.body;

  if (!subjectId) return res.status(400).json({ message: 'Subject ID is required' });

  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true } });
  if (!subject) return res.status(404).json({ message: 'Subject not found' });

  let topicInfo = '';
  if (topicId) {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: { subtopics: { orderBy: { orderIndex: 'asc' } } },
    });
    if (topic) {
      topicInfo = `\nTOPIC: ${topic.title}${topic.description ? ` — ${topic.description}` : ''}`;
      if (topic.subtopics.length > 0) {
        topicInfo += `\nSUBTOPICS:\n${topic.subtopics.map((st, i) => `${i + 1}. ${st.title}`).join('\n')}`;
      }
    }
  } else if (topicName) {
    topicInfo = `\nTOPIC: ${topicName}`;
  }

  const typeInstructions = questionTypes.map((t: string) => {
    switch (t) {
      case 'MULTIPLE_CHOICE': return 'Multiple Choice (with 4 options, exactly one correct)';
      case 'TRUE_FALSE': return 'True/False';
      case 'SHORT_ANSWER': return 'Short Answer';
      default: return t;
    }
  }).join(', ');

  const prompt = `Generate exactly ${questionCount} assessment questions.

SUBJECT: ${subject.name}${topicInfo}
DIFFICULTY: ${difficulty}
QUESTION TYPES TO USE: ${typeInstructions}

Return ONLY a valid JSON array of questions in this exact format (no markdown, no explanation):
[
  {
    "text": "Question text here",
    "type": "MULTIPLE_CHOICE",
    "points": 2,
    "options": [
      {"text": "Option A", "isCorrect": true},
      {"text": "Option B", "isCorrect": false},
      {"text": "Option C", "isCorrect": false},
      {"text": "Option D", "isCorrect": false}
    ]
  },
  {
    "text": "True or false statement here",
    "type": "TRUE_FALSE",
    "points": 1,
    "options": [
      {"text": "True", "isCorrect": true},
      {"text": "False", "isCorrect": false}
    ]
  },
  {
    "text": "Short answer question here",
    "type": "SHORT_ANSWER",
    "points": 3,
    "correctAnswer": "Expected answer"
  }
]

Requirements:
- Questions should be appropriate for Zambian students
- Use clear, simple English language
- For MULTIPLE_CHOICE: exactly 4 options, exactly one correct
- For TRUE_FALSE: two options (True and False)
- For SHORT_ANSWER: include a correctAnswer field
- Distribute points fairly (1-5 per question)
- Return ONLY the JSON array, no other text or markdown`;

  const aiResponse = await aiService.chat([
    { role: 'user', content: prompt },
  ], { temperature: 0.7, maxTokens: 2500 });

  let questions;
  try {
    const content = aiResponse.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      questions = JSON.parse(jsonMatch[0]);
    } else {
      questions = JSON.parse(content);
    }
  } catch (e) {
    return res.status(500).json({ message: 'Failed to parse AI response', raw: aiResponse.content });
  }

  res.json({ questions });
});

/**
 * POST /api/v1/syllabus/generate-homework
 * AI-generate homework content for a given subject/topic
 */
export const generateHomework = handler(async (req, res) => {
  const { subjectId, topicId, topicName, gradeLevel, homeworkType = 'HOMEWORK' } = req.body;

  if (!subjectId) return res.status(400).json({ message: 'Subject ID is required' });

  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true } });
  if (!subject) return res.status(404).json({ message: 'Subject not found' });

  let topicInfo = '';
  if (topicId) {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: { subtopics: { orderBy: { orderIndex: 'asc' } } },
    });
    if (topic) {
      topicInfo = `\nTOPIC: ${topic.title}${topic.description ? ` — ${topic.description}` : ''}`;
      if (topic.subtopics.length > 0) {
        topicInfo += `\nSUBTOPICS: ${topic.subtopics.map(st => st.title).join(', ')}`;
      }
    }
  } else if (topicName) {
    topicInfo = `\nTOPIC: ${topicName}`;
  }

  const typeLabel = homeworkType === 'PROJECT' ? 'project assignment' : 'homework assignment';

  const prompt = `Generate a ${typeLabel} for students.

SUBJECT: ${subject.name}${topicInfo}
${gradeLevel ? `GRADE LEVEL: ${gradeLevel}` : ''}
TYPE: ${typeLabel}

Generate a structured ${typeLabel} with:
1. **Title** — A clear, descriptive title
2. **Description** — What the student needs to do (2-3 paragraphs)
3. **Tasks/Questions** — 3-5 specific tasks or questions for the student to complete
4. **Marking Guide** — How marks are allocated (suggest total marks)

Write in clear, simple English appropriate for Zambian students.
Format as a structured text document.`;

  const aiResponse = await aiService.chat([
    { role: 'user', content: prompt },
  ], { temperature: 0.6, maxTokens: 1500 });

  res.json({
    content: aiResponse.content,
    subjectName: subject.name,
    type: homeworkType,
  });
});

/**
 * POST /api/v1/syllabus/generate-syllabus
 * AI-generate topics + subtopics for a subject at a given grade level
 * This fills in empty curricula using Zambian curriculum knowledge.
 */
export const generateSyllabus = handler(async (req, res) => {
  const { subjectId, gradeLevel } = req.body;
  if (!subjectId || gradeLevel === undefined) {
    return res.status(400).json({ message: 'subjectId and gradeLevel are required' });
  }

  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true, code: true } });
  if (!subject) return res.status(404).json({ message: 'Subject not found' });

  // Check if topics already exist
  const existingCount = await prisma.topic.count({ where: { subjectId, gradeLevel: Number(gradeLevel) } });
  if (existingCount > 0) {
    return res.status(400).json({ message: `This subject already has ${existingCount} topics at this grade level. Delete them first to regenerate.` });
  }

  // Determine age/grade label for the AI prompt
  const gl = Number(gradeLevel);
  let levelDesc = '';
  if (gl <= -1) levelDesc = `Early Childhood Education (ECE), age ${gl + 6} years`;
  else if (gl === 0) levelDesc = `Early Childhood Education (ECE), reception/pre-school, age 5-6 years`;
  else if (gl <= 4) levelDesc = `Lower Primary, Grade ${gl} (age ${gl + 5}-${gl + 6} years)`;
  else if (gl <= 7) levelDesc = `Upper Primary, Grade ${gl} (age ${gl + 5}-${gl + 6} years)`;
  else levelDesc = `Secondary, Form ${gl - 7} / Grade ${gl} (age ${gl + 5}-${gl + 6} years)`;

  const prompt = `You are a Zambian curriculum expert. Generate a comprehensive syllabus for:

SUBJECT: ${subject.name} (${subject.code})
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

  const aiResponse = await aiService.chat([
    { role: 'user', content: prompt },
  ], { temperature: 0.4, maxTokens: 4000 });

  // Parse AI response
  let syllabusData: any;
  try {
    const content = aiResponse.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      syllabusData = JSON.parse(jsonMatch[0]);
    } else {
      syllabusData = JSON.parse(content);
    }
  } catch (e) {
    return res.status(500).json({ message: 'Failed to parse AI response', raw: aiResponse.content });
  }

  if (!syllabusData?.topics || !Array.isArray(syllabusData.topics)) {
    return res.status(500).json({ message: 'AI returned invalid structure', raw: aiResponse.content });
  }

  // Save to database
  const createdTopics: any[] = [];
  for (const topicData of syllabusData.topics) {
    const topic = await prisma.topic.create({
      data: {
        title: topicData.title,
        description: topicData.description || null,
        subjectId,
        gradeLevel: gl,
        orderIndex: topicData.orderIndex || (createdTopics.length + 1),
      },
    });

    const subtopics: any[] = [];
    if (Array.isArray(topicData.subtopics)) {
      for (const stData of topicData.subtopics) {
        const st = await prisma.subTopic.create({
          data: {
            title: stData.title,
            description: stData.description || null,
            learningObjectives: stData.learningObjectives ? JSON.stringify(stData.learningObjectives) : null,
            topicId: topic.id,
            orderIndex: stData.orderIndex || (subtopics.length + 1),
            duration: stData.duration || null,
          },
        });
        subtopics.push(st);
      }
    }

    createdTopics.push({ ...topic, subtopics });
  }

  res.json({
    message: `Generated ${createdTopics.length} topics with subtopics`,
    topics: createdTopics,
    subject: subject.name,
    gradeLevel: gl,
  });
});

/**
 * GET /api/v1/syllabus/next-topic
 * Suggest the next untaught topic for a class + subject
 */
export const getNextTopic = handler(async (req, res) => {
  const { classId, subjectId } = req.query;

  if (!classId || !subjectId) {
    return res.status(400).json({ message: 'Class ID and Subject ID are required' });
  }

  const classInfo = await prisma.class.findUnique({ where: { id: classId as string } });
  if (!classInfo) return res.status(404).json({ message: 'Class not found' });

  // Get all topics with their progress for this class
  const topics = await prisma.topic.findMany({
    where: {
      subjectId: subjectId as string,
      gradeLevel: classInfo.gradeLevel,
    },
    orderBy: { orderIndex: 'asc' },
    include: {
      subtopics: { orderBy: { orderIndex: 'asc' } },
      progress: { where: { classId: classId as string } },
    },
  });

  const totalTopics = topics.length;
  const completedTopics = topics.filter(t => t.progress[0]?.status === 'COMPLETED').length;
  const inProgressTopics = topics.filter(t => t.progress[0]?.status === 'IN_PROGRESS').length;

  // Find the first non-completed topic (prefer IN_PROGRESS, then PENDING)
  const nextTopic = topics.find(t => t.progress[0]?.status === 'IN_PROGRESS')
    || topics.find(t => !t.progress[0] || t.progress[0]?.status === 'PENDING');

  res.json({
    nextTopic: nextTopic || null,
    progress: {
      total: totalTopics,
      completed: completedTopics,
      inProgress: inProgressTopics,
      pending: totalTopics - completedTopics - inProgressTopics,
      percentage: totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0,
    },
  });
});

// ==========================================
// CONTENT INGESTION (SUPER_ADMIN only)
// ==========================================

/**
 * POST /api/v1/syllabus/ingest-content
 * Ingest all CDC PDFs into TeachingContent table.
 * Body: { syllabi?: boolean, modules?: boolean }
 */
export const ingestContent = handler(async (req, res) => {
  const { syllabi = true, modules = true } = req.body || {};
  console.log(`[Syllabus] Content ingestion triggered by user ${(req as any).user?.id}`);
  const summary = await ingestAllPDFs({ syllabi, modules });
  res.json(summary);
});

/**
 * GET /api/v1/syllabus/ingestion-status
 * Check what content has been ingested.
 */
export const ingestionStatus = handler(async (req, res) => {
  const status = await getIngestionStatus();
  res.json(status);
});
