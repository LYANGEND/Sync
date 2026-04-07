import aiService from './aiService';
import { prisma } from '../utils/prisma';

// ==========================================
// AI STUDY BUDDY SERVICE
// ==========================================
// Personal AI learning assistant for students
// Provides homework help, practice questions, study plans

interface PracticeQuestion {
  question: string;
  type: 'multiple_choice' | 'short_answer' | 'true_false' | 'essay';
  options?: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
}

interface StudyPlan {
  studentId: string;
  examDate: Date;
  subjects: Array<{
    subjectId: string;
    subjectName: string;
    currentLevel: string;
    targetGrade: string;
    weeklyHours: number;
    topics: Array<{
      topicId: string;
      topicName: string;
      priority: 'high' | 'medium' | 'low';
      estimatedHours: number;
      resources: string[];
    }>;
  }>;
  weeklySchedule: Array<{
    day: string;
    sessions: Array<{
      time: string;
      subject: string;
      activity: string;
      duration: number;
    }>;
  }>;
  milestones: Array<{
    date: Date;
    description: string;
    completed: boolean;
  }>;
}

interface ConceptExplanation {
  concept: string;
  simpleExplanation: string;
  detailedExplanation: string;
  examples: string[];
  analogies: string[];
  commonMistakes: string[];
  practiceQuestions: PracticeQuestion[];
  relatedConcepts: string[];
}

/**
 * Generate practice questions based on student's weak areas
 */
export async function generatePracticeQuestions(
  studentId: string,
  subjectId: string,
  topicId?: string,
  count: number = 5,
  difficulty?: 'easy' | 'medium' | 'hard'
): Promise<PracticeQuestion[]> {
  // 1. Get student's performance data
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      class: { select: { name: true, gradeLevel: true } },
    },
  });

  if (!student) throw new Error('Student not found');

  // 2. Get subject and topic info
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { name: true, code: true },
  });

  if (!subject) throw new Error('Subject not found');

  let topicInfo = null;
  if (topicId) {
    topicInfo = await prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        subtopics: {
          orderBy: { orderIndex: 'asc' },
          take: 5,
        },
      },
    });
  }

  // 3. Determine difficulty based on student's recent performance
  let targetDifficulty = difficulty;
  if (!targetDifficulty) {
    // Auto-determine based on recent grades
    const recentGrades = await prisma.studentGrade.findMany({
      where: {
        studentId,
        subjectId,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (recentGrades.length > 0) {
      const avgScore = recentGrades.reduce((sum, g) => sum + Number(g.score || 0), 0) / recentGrades.length;
      if (avgScore >= 75) targetDifficulty = 'hard';
      else if (avgScore >= 50) targetDifficulty = 'medium';
      else targetDifficulty = 'easy';
    } else {
      targetDifficulty = 'medium';
    }
  }

  // 4. Generate questions using AI
  const prompt = `Generate ${count} practice questions for a Zambian student.

STUDENT LEVEL: ${student.class?.name || 'Unknown'} (Grade ${student.class?.gradeLevel || 'Unknown'})
SUBJECT: ${subject.name}
${topicInfo ? `TOPIC: ${topicInfo.title}` : ''}
${topicInfo?.description ? `TOPIC DESCRIPTION: ${topicInfo.description}` : ''}
${topicInfo?.subtopics && topicInfo.subtopics.length > 0 ? `
SUBTOPICS TO COVER:
${topicInfo.subtopics.map((st: any) => `- ${st.title}: ${st.description || ''}`).join('\n')}
` : ''}
DIFFICULTY: ${targetDifficulty}

Generate ${count} questions that:
1. Test understanding of key concepts
2. Are appropriate for the student's grade level
3. Include a mix of question types (multiple choice, short answer, true/false)
4. Have clear, unambiguous correct answers
5. Include explanations that help the student learn
6. Use Zambian context and examples where appropriate

For multiple choice questions, provide 4 options with one correct answer.

Return JSON array:
[
  {
    "question": "Question text",
    "type": "multiple_choice" | "short_answer" | "true_false",
    "options": ["Option A", "Option B", "Option C", "Option D"], // only for multiple_choice
    "correctAnswer": "The correct answer",
    "explanation": "Why this is correct and how to approach this type of question",
    "difficulty": "${targetDifficulty}",
    "topic": "${topicInfo?.title || subject.name}"
  }
]`;

  const questions = await aiService.generateJSON<PracticeQuestion[]>(prompt, {
    systemPrompt: `You are an experienced Zambian teacher creating practice questions.
Make questions educational, fair, and aligned with ECZ curriculum standards.
Ensure questions are culturally appropriate and use local context.`,
    temperature: 0.7,
  });

  return questions;
}

/**
 * Explain a concept in simple terms with examples
 */
export async function explainConcept(
  concept: string,
  subjectId: string,
  studentLevel: string,
  learningStyle?: 'visual' | 'auditory' | 'kinesthetic'
): Promise<ConceptExplanation> {
  // Get subject info
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { name: true },
  });

  if (!subject) throw new Error('Subject not found');

  const prompt = `Explain this concept to a ${studentLevel} student in Zambia.

CONCEPT: ${concept}
SUBJECT: ${subject.name}
LEARNING STYLE: ${learningStyle || 'general'}

Provide:
1. SIMPLE EXPLANATION (2-3 sentences, like explaining to a friend)
2. DETAILED EXPLANATION (2-3 paragraphs with more depth)
3. REAL-WORLD EXAMPLES (3-4 examples, use Zambian context)
4. ANALOGIES (2-3 analogies to make it relatable)
5. COMMON MISTAKES (what students often get wrong)
6. PRACTICE QUESTIONS (3 questions to test understanding)
7. RELATED CONCEPTS (what to learn next)

${learningStyle === 'visual' ? 'Focus on visual descriptions, diagrams, and spatial relationships.' : ''}
${learningStyle === 'auditory' ? 'Use rhythms, patterns, and verbal explanations.' : ''}
${learningStyle === 'kinesthetic' ? 'Include hands-on activities and physical demonstrations.' : ''}

Return JSON:
{
  "concept": "${concept}",
  "simpleExplanation": "...",
  "detailedExplanation": "...",
  "examples": ["Example 1", "Example 2", "Example 3"],
  "analogies": ["Analogy 1", "Analogy 2"],
  "commonMistakes": ["Mistake 1", "Mistake 2"],
  "practiceQuestions": [
    {
      "question": "...",
      "type": "multiple_choice",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "...",
      "explanation": "...",
      "difficulty": "easy",
      "topic": "${concept}"
    }
  ],
  "relatedConcepts": ["Concept 1", "Concept 2"]
}`;

  const explanation = await aiService.generateJSON<ConceptExplanation>(prompt, {
    systemPrompt: `You are a patient, encouraging tutor explaining concepts to Zambian students.
Use simple language, local examples, and culturally relevant analogies.
Make learning engaging and accessible.`,
    temperature: 0.7,
  });

  return explanation;
}

/**
 * Create a personalized study plan for upcoming exams
 */
export async function createStudyPlan(
  studentId: string,
  examDate: Date,
  subjectIds: string[]
): Promise<StudyPlan> {
  // 1. Get student data
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      class: { select: { name: true, gradeLevel: true } },
    },
  });

  if (!student) throw new Error('Student not found');

  // 2. Get subjects and student's performance
  const subjects = await Promise.all(
    subjectIds.map(async (subjectId) => {
      const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        include: {
          topics: {
            orderBy: { orderIndex: 'asc' },
            take: 10,
          },
        },
      });

      if (!subject) return null;

      // Get recent grades
      const recentGrades = await prisma.studentGrade.findMany({
        where: { studentId, subjectId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      const avgScore = recentGrades.length > 0
        ? recentGrades.reduce((sum, g) => sum + Number(g.score || 0), 0) / recentGrades.length
        : 50;

      return {
        id: subjectId,
        name: subject.name,
        avgScore,
        topics: subject.topics,
      };
    })
  );

  const validSubjects = subjects.filter(s => s !== null);

  // 3. Calculate days until exam
  const daysUntilExam = Math.ceil((examDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (daysUntilExam < 1) {
    throw new Error('Exam date must be in the future');
  }

  // 4. Generate study plan using AI
  const prompt = `Create a comprehensive study plan for a Zambian ${student.class?.name || 'student'} preparing for exams.

STUDENT: ${student.firstName} ${student.lastName}
EXAM DATE: ${examDate.toLocaleDateString()} (${daysUntilExam} days from now)

SUBJECTS AND CURRENT PERFORMANCE:
${validSubjects.map(s => `
- ${s!.name}: Current average ${Math.round(s!.avgScore)}%
  Topics: ${s!.topics.map((t: any) => t.title).join(', ')}
`).join('\n')}

Create a study plan that:
1. Allocates time based on subject difficulty and current performance
2. Prioritizes weak areas while maintaining strong areas
3. Includes daily study sessions (realistic for a student)
4. Builds in review time and practice tests
5. Includes breaks and rest days
6. Sets weekly milestones

Assume student can study 2-3 hours per day on weekdays, 4-5 hours on weekends.

Return JSON:
{
  "subjects": [
    {
      "subjectId": "...",
      "subjectName": "...",
      "currentLevel": "Average: XX%",
      "targetGrade": "A" | "B" | "C",
      "weeklyHours": 5,
      "topics": [
        {
          "topicId": "...",
          "topicName": "...",
          "priority": "high" | "medium" | "low",
          "estimatedHours": 2,
          "resources": ["Textbook Chapter 3", "Practice problems"]
        }
      ]
    }
  ],
  "weeklySchedule": [
    {
      "day": "Monday",
      "sessions": [
        {
          "time": "16:00-17:30",
          "subject": "Mathematics",
          "activity": "Review algebra",
          "duration": 90
        }
      ]
    }
  ],
  "milestones": [
    {
      "date": "2024-01-15",
      "description": "Complete all Mathematics topics",
      "completed": false
    }
  ]
}`;

  const plan = await aiService.generateJSON<Omit<StudyPlan, 'studentId' | 'examDate'>>(prompt, {
    systemPrompt: `You are an experienced study coach creating realistic, achievable study plans.
Consider the Zambian school context, student workload, and need for balance.
Make plans motivating and sustainable.`,
    temperature: 0.6,
  });

  return {
    studentId,
    examDate,
    ...plan,
  };
}

/**
 * Summarize notes or content for easier revision
 */
export async function summarizeNotes(
  content: string,
  targetLength: 'brief' | 'medium' | 'detailed' = 'medium',
  format: 'bullet_points' | 'paragraph' | 'flashcards' = 'bullet_points'
): Promise<string> {
  const lengthGuide = {
    brief: '5-7 key points',
    medium: '10-15 key points',
    detailed: '20-30 key points with explanations',
  };

  const formatGuide = {
    bullet_points: 'organized bullet points',
    paragraph: 'flowing paragraphs',
    flashcards: 'question-answer pairs for flashcards',
  };

  const prompt = `Summarize these study notes for a student.

ORIGINAL CONTENT:
${content.substring(0, 5000)}${content.length > 5000 ? '...' : ''}

Create a ${targetLength} summary in ${formatGuide[format]} format.
Target length: ${lengthGuide[targetLength]}

Focus on:
1. Key concepts and definitions
2. Important facts and figures
3. Relationships between ideas
4. Common exam questions
5. Practical applications

Make it easy to review and remember.`;

  const summary = await aiService.generateText(prompt, {
    systemPrompt: 'You are creating study summaries that help students learn efficiently.',
    temperature: 0.5,
  });

  return summary;
}

export default {
  generatePracticeQuestions,
  explainConcept,
  createStudyPlan,
  summarizeNotes,
};
