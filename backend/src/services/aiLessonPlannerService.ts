import aiService from './aiService';
import { prisma } from '../utils/prisma';

// ==========================================
// AI LESSON PLANNER SERVICE
// ==========================================
// Generates comprehensive lesson plans from syllabus content
// Saves teachers 3-5 hours per lesson plan

interface LessonPlanRequest {
  topicId: string;
  duration: number; // minutes
  classLevel: string;
  teachingStyle?: 'lecture' | 'interactive' | 'hands-on' | 'inquiry-based';
  includeAssessment?: boolean;
  includeHomework?: boolean;
}

interface LessonSection {
  section: string;
  duration: number;
  activities: string[];
  teachingPoints: string[];
  resources?: string[];
}

interface LessonPlanResponse {
  title: string;
  subject: string;
  classLevel: string;
  duration: number;
  objectives: string[];
  introduction: string;
  mainContent: LessonSection[];
  assessment: string[];
  homework: string;
  resources: string[];
  differentiationTips: string[];
  culturalContext?: string;
}

/**
 * Generate a comprehensive lesson plan using AI
 */
export async function generateLessonPlan(
  request: LessonPlanRequest
): Promise<LessonPlanResponse> {
  // 1. Load topic and subtopics from database
  const topic = await prisma.topic.findUnique({
    where: { id: request.topicId },
    include: {
      subtopics: {
        orderBy: { orderIndex: 'asc' },
      },
      subject: {
        select: { name: true, code: true },
      },
    },
  });

  if (!topic) throw new Error('Topic not found');

  // 2. Load approved teaching content from syllabi/modules
  const teachingContent = await prisma.teachingContent.findMany({
    where: {
      topicId: request.topicId,
      approved: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      title: true,
      content: true,
      source: true,
      contentType: true,
    },
  });

  // 3. Build comprehensive context for AI
  const subtopicsContext = topic.subtopics.map((st: any) => {
    const objectives = st.learningObjectives 
      ? (typeof st.learningObjectives === 'string' 
          ? JSON.parse(st.learningObjectives) 
          : st.learningObjectives)
      : [];
    
    return {
      title: st.title,
      description: st.description || '',
      objectives: Array.isArray(objectives) ? objectives : [],
      duration: st.duration || 0,
    };
  });

  const approvedContent = teachingContent.map(tc => ({
    type: tc.contentType,
    source: tc.source,
    title: tc.title,
    content: tc.content,
  }));

  // 4. Generate AI lesson plan
  const prompt = `Generate a detailed, practical lesson plan for a Zambian ${request.classLevel} class.

TOPIC: ${topic.title}
SUBJECT: ${topic.subject.name}
DURATION: ${request.duration} minutes
TEACHING STYLE: ${request.teachingStyle || 'interactive'}

TOPIC OVERVIEW:
${topic.description || 'No description available'}

SUBTOPICS TO COVER:
${subtopicsContext.map((st, i) => `
${i + 1}. ${st.title}
   Description: ${st.description}
   Learning Objectives: ${st.objectives.join('; ')}
   Suggested Duration: ${st.duration} minutes
`).join('\n')}

${approvedContent.length > 0 ? `
APPROVED TEACHING MATERIAL (from ${approvedContent[0].source}):
${approvedContent.map(ac => `
--- ${ac.type}: ${ac.title} ---
${ac.content.substring(0, 2000)}${ac.content.length > 2000 ? '...' : ''}
`).join('\n')}
` : ''}

Create a comprehensive lesson plan with:

1. CLEAR LEARNING OBJECTIVES (3-5 specific, measurable objectives)
2. ENGAGING INTRODUCTION (5-10 minutes)
   - Hook to capture attention
   - Connection to prior knowledge
   - Preview of what students will learn

3. MAIN CONTENT SECTIONS (${request.duration - 20} minutes total)
   - Break into logical segments
   - Include timing for each section
   - Specific teaching points for each section
   - Interactive activities (think-pair-share, demonstrations, examples)
   - Questions to check understanding
   - Transition statements between sections

4. ASSESSMENT METHODS
   - Formative assessment during lesson
   - Summative assessment at end
   - Exit ticket or quick check

5. HOMEWORK ASSIGNMENT
   - Reinforces lesson content
   - Appropriate difficulty level
   - Clear instructions

6. REQUIRED RESOURCES
   - Materials needed
   - Technology requirements
   - Handouts or worksheets

7. DIFFERENTIATION TIPS
   - Support for struggling students
   - Extension for advanced students
   - Accommodations for different learning styles

IMPORTANT GUIDELINES:
- Use Zambian context and local examples where appropriate
- Align with ECZ curriculum standards
- Make it practical and immediately usable
- Include specific teacher actions and student activities
- Use active learning strategies
- Consider classroom management
- Be culturally sensitive and inclusive

Format as JSON matching this exact structure:
{
  "title": "Lesson title",
  "subject": "${topic.subject.name}",
  "classLevel": "${request.classLevel}",
  "duration": ${request.duration},
  "objectives": ["Objective 1", "Objective 2", "Objective 3"],
  "introduction": "Detailed introduction with hook and preview",
  "mainContent": [
    {
      "section": "Section title",
      "duration": 15,
      "activities": ["Activity 1", "Activity 2"],
      "teachingPoints": ["Key point 1", "Key point 2"],
      "resources": ["Resource 1", "Resource 2"]
    }
  ],
  "assessment": ["Assessment method 1", "Assessment method 2"],
  "homework": "Detailed homework assignment",
  "resources": ["Resource 1", "Resource 2"],
  "differentiationTips": ["Tip 1", "Tip 2"],
  "culturalContext": "How this lesson connects to Zambian context"
}`;

  const result = await aiService.generateJSON<LessonPlanResponse>(prompt, {
    systemPrompt: `You are an experienced Zambian teacher and curriculum specialist creating lesson plans aligned with the ECZ curriculum. 
Your lesson plans are practical, engaging, culturally relevant, and immediately usable by teachers.
You understand the Zambian education context, local resources, and student needs.
Make plans detailed enough to be useful but flexible enough to adapt.`,
    temperature: 0.7,
    maxTokens: 3000,
  });

  // 5. Log AI usage
  try {
    await prisma.aIUsageLog.create({
      data: {
        userId: 'system',
        feature: 'lesson-planner',
        action: 'generate-lesson-plan',
        tokensUsed: 0, // Will be updated by aiService
        metadata: {
          topicId: request.topicId,
          topicTitle: topic.title,
          duration: request.duration,
          classLevel: request.classLevel,
        } as any,
      },
    });
  } catch (err) {
    console.error('[LessonPlanner] Failed to log usage:', err);
  }

  return result;
}

/**
 * Generate multiple lesson plans for a unit (multiple topics)
 */
export async function generateUnitPlan(
  subjectId: string,
  topicIds: string[],
  classLevel: string,
  totalWeeks: number
): Promise<{
  unitTitle: string;
  overview: string;
  lessonPlans: LessonPlanResponse[];
  assessmentPlan: string;
  resources: string[];
}> {
  // Load all topics
  const topics = await prisma.topic.findMany({
    where: {
      id: { in: topicIds },
      subjectId,
    },
    include: {
      subject: { select: { name: true } },
      subtopics: true,
    },
  });

  if (topics.length === 0) throw new Error('No topics found');

  // Generate overview
  const overviewPrompt = `Create a unit overview for a ${totalWeeks}-week unit covering these topics:

${topics.map((t, i) => `${i + 1}. ${t.title}: ${t.description || ''}`).join('\n')}

Subject: ${topics[0].subject.name}
Class Level: ${classLevel}

Provide:
1. Unit title
2. Unit overview (2-3 paragraphs)
3. Overall assessment plan
4. Required resources for the unit

Format as JSON:
{
  "unitTitle": "...",
  "overview": "...",
  "assessmentPlan": "...",
  "resources": ["..."]
}`;

  const unitOverview = await aiService.generateJSON<{
    unitTitle: string;
    overview: string;
    assessmentPlan: string;
    resources: string[];
  }>(overviewPrompt, {
    systemPrompt: 'You are a curriculum specialist creating unit plans for Zambian schools.',
    temperature: 0.7,
  });

  // Generate individual lesson plans
  const lessonPlans: LessonPlanResponse[] = [];
  const lessonsPerWeek = 3; // Typical
  const minutesPerLesson = Math.floor((totalWeeks * lessonsPerWeek * 40) / topics.length);

  for (const topic of topics) {
    const plan = await generateLessonPlan({
      topicId: topic.id,
      duration: minutesPerLesson,
      classLevel,
      teachingStyle: 'interactive',
      includeAssessment: true,
      includeHomework: true,
    });
    lessonPlans.push(plan);
  }

  return {
    unitTitle: unitOverview.unitTitle,
    overview: unitOverview.overview,
    lessonPlans,
    assessmentPlan: unitOverview.assessmentPlan,
    resources: unitOverview.resources,
  };
}

/**
 * Adapt an existing lesson plan for different class level or teaching style
 */
export async function adaptLessonPlan(
  lessonPlanId: string,
  adaptations: {
    newClassLevel?: string;
    newTeachingStyle?: string;
    shortenTo?: number; // minutes
    focusAreas?: string[];
  }
): Promise<LessonPlanResponse> {
  const existingPlan = await prisma.lessonPlan.findUnique({
    where: { id: lessonPlanId },
    include: {
      subject: { select: { name: true } },
    },
  });

  if (!existingPlan) throw new Error('Lesson plan not found');

  const prompt = `Adapt this existing lesson plan with the following changes:

ORIGINAL LESSON PLAN:
Title: ${existingPlan.title}
Subject: ${existingPlan.subject.name}
Content: ${existingPlan.content}

REQUESTED ADAPTATIONS:
${adaptations.newClassLevel ? `- New class level: ${adaptations.newClassLevel}` : ''}
${adaptations.newTeachingStyle ? `- New teaching style: ${adaptations.newTeachingStyle}` : ''}
${adaptations.shortenTo ? `- Shorten to: ${adaptations.shortenTo} minutes` : ''}
${adaptations.focusAreas ? `- Focus on: ${adaptations.focusAreas.join(', ')}` : ''}

Create an adapted version that maintains the core content but adjusts for the new requirements.
Keep the same JSON structure as the original.`;

  const adapted = await aiService.generateJSON<LessonPlanResponse>(prompt, {
    systemPrompt: 'You are adapting lesson plans while maintaining quality and alignment with curriculum.',
    temperature: 0.6,
  });

  return adapted;
}

export default {
  generateLessonPlan,
  generateUnitPlan,
  adaptLessonPlan,
};
