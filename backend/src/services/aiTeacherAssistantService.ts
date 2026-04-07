/**
 * AI Teacher Assistant Service
 * ────────────────────────────────
 * Provides AI-powered assistance for teachers:
 * - Lesson plan generation from syllabus
 * - Resource recommendations
 * - Assessment generation
 * 
 * Follows DRY principle by reusing aiService for all AI calls
 */

import { prisma } from '../utils/prisma';
import aiService from './aiService';

// ==========================================
// TYPES
// ==========================================

export interface LessonPlanRequest {
  topicId: string;
  duration: number; // minutes
  classLevel?: string;
  teachingStyle?: 'lecture' | 'interactive' | 'hands-on' | 'mixed';
  includeAssessment?: boolean;
}

export interface LessonPlanSection {
  section: string;
  duration: number;
  activities: string[];
  teachingPoints: string[];
  resources?: string[];
}

export interface LessonPlanResponse {
  title: string;
  subject: string;
  classLevel: string;
  duration: number;
  objectives: string[];
  introduction: string;
  mainContent: LessonPlanSection[];
  assessment: string[];
  homework: string;
  resources: string[];
  generatedAt: string;
}

// ==========================================
// LESSON PLAN GENERATION
// ==========================================

/**
 * Generate a comprehensive lesson plan from a topic
 */
export async function generateLessonPlan(
  request: LessonPlanRequest
): Promise<LessonPlanResponse> {
  // 1. Load topic with all related content
  const topic = await prisma.topic.findUnique({
    where: { id: request.topicId },
    include: {
      subject: { select: { name: true, code: true } },
      subtopics: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          learningObjectives: true,
          duration: true,
        },
      },
    },
  });

  if (!topic) {
    throw new Error('Topic not found');
  }

  // 2. Load approved teaching content for this topic
  const teachingContent = await prisma.teachingContent.findMany({
    where: {
      topicId: request.topicId,
      approved: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      title: true,
      content: true,
      source: true,
      contentType: true,
    },
  });

  // 3. Build context for AI
  const subtopicsContext = topic.subtopics.map((st: any) => {
    let objectives: string[] = [];
    if (st.learningObjectives) {
      try {
        const parsed = JSON.parse(st.learningObjectives);
        if (Array.isArray(parsed)) objectives = parsed;
      } catch { /* ignore */ }
    }

    return {
      title: st.title,
      description: st.description || '',
      objectives,
      duration: st.duration || 0,
    };
  }).filter(st => st.title);

  const approvedContent = teachingContent.map(tc => ({
    type: tc.contentType,
    title: tc.title,
    source: tc.source,
    content: tc.content.substring(0, 2000), // Limit to avoid token overflow
  }));

  // 4. Determine class level
  const classLevel = request.classLevel || 'Secondary';

  // 5. Build AI prompt
  const prompt = `Generate a detailed, practical lesson plan for a Zambian ${classLevel} class.

TOPIC: ${topic.title}
SUBJECT: ${topic.subject.name}
DURATION: ${request.duration} minutes
TEACHING STYLE: ${request.teachingStyle || 'interactive'}

${topic.description ? `TOPIC OVERVIEW:\n${topic.description}\n` : ''}

SUBTOPICS TO COVER:
${subtopicsContext.map((st, i) => `${i + 1}. ${st.title}${st.description ? ` - ${st.description}` : ''}
   Objectives: ${st.objectives.length > 0 ? st.objectives.join('; ') : 'Not specified'}
   Suggested duration: ${st.duration || 'flexible'} minutes`).join('\n')}

${approvedContent.length > 0 ? `APPROVED TEACHING MATERIAL (use this as your source of truth):
${approvedContent.map(ac => `[${ac.type}] ${ac.title} (Source: ${ac.source})
${ac.content}`).join('\n\n')}` : ''}

Create a lesson plan that:
1. Has 3-5 clear, measurable learning objectives
2. Includes an engaging introduction/hook (5-10 minutes)
3. Breaks main content into logical sections with timing
4. Includes interactive activities appropriate for ${request.teachingStyle || 'interactive'} teaching
5. Provides specific teaching points for each section
6. ${request.includeAssessment !== false ? 'Includes formative assessment methods' : 'Mentions assessment briefly'}
7. Suggests meaningful homework
8. Lists required resources (textbooks, materials, etc.)

IMPORTANT:
- Use ONLY the approved teaching material provided above as your content source
- Make it practical and actionable for a Zambian teacher
- Use local examples and context where appropriate
- Keep language clear and accessible
- Ensure total timing adds up to approximately ${request.duration} minutes

Return JSON matching this exact structure:
{
  "title": "Lesson title",
  "objectives": ["Objective 1", "Objective 2", "..."],
  "introduction": "Hook/introduction description",
  "mainContent": [
    {
      "section": "Section name",
      "duration": 20,
      "activities": ["Activity 1", "Activity 2"],
      "teachingPoints": ["Point 1", "Point 2"],
      "resources": ["Resource 1", "Resource 2"]
    }
  ],
  "assessment": ["Assessment method 1", "Assessment method 2"],
  "homework": "Homework description",
  "resources": ["Overall resource 1", "Overall resource 2"]
}`;

  // 6. Generate lesson plan using AI
  const result = await aiService.generateJSON<Omit<LessonPlanResponse, 'subject' | 'classLevel' | 'duration' | 'generatedAt'>>(
    prompt,
    {
      systemPrompt: `You are an experienced Zambian teacher and curriculum specialist. 
Create practical, engaging lesson plans aligned with the ECZ curriculum.
Use the approved teaching material provided as your single source of truth.
Make plans culturally relevant with local examples.
Ensure all content is factually accurate and age-appropriate.`,
      temperature: 0.7,
    }
  );

  // 7. Return complete response
  return {
    ...result,
    subject: topic.subject.name,
    classLevel,
    duration: request.duration,
    generatedAt: new Date().toISOString(),
  };
}

// ==========================================
// RESOURCE RECOMMENDATIONS
// ==========================================

export interface ResourceRecommendation {
  title: string;
  type: 'textbook' | 'video' | 'worksheet' | 'experiment' | 'reading' | 'online';
  description: string;
  source?: string;
  url?: string;
}

/**
 * Recommend teaching resources for a topic
 */
export async function recommendResources(
  topicId: string,
  teachingStyle?: string
): Promise<ResourceRecommendation[]> {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      subject: { select: { name: true } },
    },
  });

  if (!topic) {
    throw new Error('Topic not found');
  }

  const prompt = `Recommend 5-7 teaching resources for this topic in a Zambian school context.

TOPIC: ${topic.title}
SUBJECT: ${topic.subject.name}
TEACHING STYLE: ${teachingStyle || 'mixed'}

Recommend a mix of:
- Textbooks (Zambian curriculum-aligned if possible)
- Videos (YouTube, educational platforms)
- Worksheets/activities
- Hands-on experiments or demonstrations
- Supplementary reading
- Online resources

For each resource, provide:
- Title
- Type (textbook/video/worksheet/experiment/reading/online)
- Brief description (1-2 sentences)
- Source/URL if applicable

Return JSON array:
[
  {
    "title": "Resource title",
    "type": "textbook",
    "description": "Brief description",
    "source": "Publisher or platform",
    "url": "URL if online resource"
  }
]`;

  const result = await aiService.generateJSON<ResourceRecommendation[]>(
    prompt,
    {
      systemPrompt: 'You are a Zambian education resource specialist. Recommend practical, accessible resources.',
      temperature: 0.6,
    }
  );

  return result;
}

// ==========================================
// ASSESSMENT GENERATION
// ==========================================

export interface AssessmentQuestion {
  question: string;
  type: 'multiple_choice' | 'short_answer' | 'essay' | 'true_false';
  options?: string[];
  correctAnswer?: string;
  points: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface AssessmentRequest {
  topicId: string;
  questionCount: number;
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
  questionTypes?: string[];
}

/**
 * Generate assessment questions for a topic
 */
export async function generateAssessment(
  request: AssessmentRequest
): Promise<AssessmentQuestion[]> {
  const topic = await prisma.topic.findUnique({
    where: { id: request.topicId },
    include: {
      subject: { select: { name: true } },
      subtopics: {
        select: {
          title: true,
          description: true,
          learningObjectives: true,
        },
      },
    },
  });

  if (!topic) {
    throw new Error('Topic not found');
  }

  // Load teaching content for question context
  const teachingContent = await prisma.teachingContent.findMany({
    where: {
      topicId: request.topicId,
      approved: true,
    },
    take: 2,
    select: { content: true },
  });

  const contentContext = teachingContent.map(tc => tc.content.substring(0, 1500)).join('\n\n');

  const prompt = `Generate ${request.questionCount} assessment questions for this topic.

TOPIC: ${topic.title}
SUBJECT: ${topic.subject.name}
DIFFICULTY: ${request.difficulty || 'mixed'}
QUESTION TYPES: ${request.questionTypes?.join(', ') || 'mixed (multiple choice, short answer, essay)'}

CONTENT TO BASE QUESTIONS ON:
${contentContext || topic.description || 'General topic knowledge'}

SUBTOPICS:
${topic.subtopics.map((st: any) => `- ${st.title}: ${st.description || ''}`).join('\n')}

Create questions that:
1. Test understanding of key concepts
2. Are clear and unambiguous
3. Are appropriate for the difficulty level
4. Cover different subtopics
5. For multiple choice: have 4 options with one clearly correct answer
6. For short answer: can be answered in 2-3 sentences
7. For essay: require deeper analysis

Return JSON array:
[
  {
    "question": "Question text",
    "type": "multiple_choice",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Option A",
    "points": 2,
    "difficulty": "medium"
  }
]`;

  const result = await aiService.generateJSON<AssessmentQuestion[]>(
    prompt,
    {
      systemPrompt: 'You are an experienced Zambian teacher creating fair, accurate assessment questions.',
      temperature: 0.5,
    }
  );

  return result;
}
