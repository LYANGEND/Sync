import { QuestionType } from '@prisma/client';
import aiService from './aiService';
import curriculumService from './curriculumService';

// ==========================================
// ACADEMIC CONTENT GENERATOR
// ==========================================
// Single source of lesson plan, question and homework generation, grounded in the
// syllabus topic and the official CDC curriculum documents. Used by Master AI tools
// and the syllabus page endpoints so both produce the same quality of content.

export interface TopicInput {
  title: string;
  description?: string | null;
  subtopics?: { title: string; description?: string | null; learningObjectives?: string | null }[];
}

export interface ContentInput {
  subjectName: string;
  subjectCode?: string | null;
  gradeLevel?: number | null;
  topic?: TopicInput | null;
  /** Free-text topic when no syllabus topic is linked. */
  topicName?: string;
}

export interface GeneratedQuestion {
  text: string;
  type: QuestionType;
  points: number;
  options: { text: string; isCorrect: boolean }[];
  correctAnswer?: string;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: 'Multiple Choice (4 options, exactly one correct)',
  TRUE_FALSE: 'True/False',
  SHORT_ANSWER: 'Short Answer',
  ESSAY: 'Essay',
};
const QUESTION_TYPES = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[];
const DEFAULT_QUESTION_TYPES: QuestionType[] = ['MULTIPLE_CHOICE', 'SHORT_ANSWER', 'TRUE_FALSE'];

export const defaultLessonDuration = (gradeLevel?: number | null) =>
  gradeLevel == null ? 45 : gradeLevel <= 0 ? 25 : gradeLevel <= 4 ? 35 : 45;

function parseObjectives(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function describeContext({ subjectName, gradeLevel, topic, topicName }: ContentInput): string {
  const lines = [`SUBJECT: ${subjectName}`];
  if (gradeLevel != null) lines.push(`GRADE: ${gradeLevel <= 0 ? `ECE (${gradeLevel})` : gradeLevel}`);
  if (topic) {
    lines.push(`TOPIC: ${topic.title}${topic.description ? ` — ${topic.description}` : ''}`);
    if (topic.subtopics?.length) {
      lines.push('SUBTOPICS:', ...topic.subtopics.map((st, i) => {
        const objectives = parseObjectives(st.learningObjectives);
        return `${i + 1}. ${st.title}${st.description ? ` — ${st.description}` : ''}${objectives.length ? `\n   Objectives: ${objectives.join('; ')}` : ''}`;
      }));
    }
  } else if (topicName) {
    lines.push(`TOPIC: ${topicName}`);
  }
  return lines.join('\n');
}

async function curriculumReference(input: ContentInput, maxChars: number, instruction: string): Promise<string> {
  if (!input.subjectCode || input.gradeLevel == null) return '';
  try {
    const reference = await curriculumService.getCurriculumContext(input.subjectCode, input.gradeLevel);
    return reference
      ? `\n=== OFFICIAL CDC CURRICULUM REFERENCE ===\n${instruction}\n${reference.substring(0, maxChars)}\n=== END REFERENCE ===\n`
      : '';
  } catch {
    return '';
  }
}

function gradeGuidance(gradeLevel?: number | null): string {
  if (gradeLevel == null) return '';
  if (gradeLevel <= 0) return '\nFor ECE: use drawing, colouring, matching and simple counting activities.';
  if (gradeLevel <= 4) return '\nFor lower primary: keep tasks simple, concrete and fun.';
  return '';
}

export async function generateLessonPlanText(input: ContentInput & { durationMinutes?: number }) {
  const durationMinutes = input.durationMinutes || defaultLessonDuration(input.gradeLevel);
  const reference = await curriculumReference(input, 6000, 'Align the lesson with this official Zambian CDC content.');

  const prompt = `Generate a structured lesson plan for a Zambian classroom. It must work for the teacher in class and for an AI tutor running a virtual lesson.

${describeContext(input)}
DURATION: ${durationMinutes} minutes
${reference}
Create the lesson plan with these sections:
1. **Introduction** (5 min) — Hook, recap of prior knowledge, today's objectives
2. **Teaching** — Main content in clear steps with examples relevant to the Zambian context
3. **Activity** — A hands-on exercise or group activity
4. **Assessment** — 3-5 quick check questions with expected answers
5. **Wrap-up** — Summary of key points and homework if applicable

Write in clear, teacher-friendly language. Include specific examples, teaching tips and expected learner responses.${gradeGuidance(input.gradeLevel)}`;

  const response = await aiService.chat([{ role: 'user', content: prompt }], { temperature: 0.5, maxTokens: 2000 });
  return { content: response.content, durationMinutes };
}

function normalizeQuestion(raw: any): GeneratedQuestion | null {
  const text = String(raw?.text ?? raw?.question ?? '').trim();
  if (!text) return null;

  const correctAnswer = raw.correctAnswer != null && raw.correctAnswer !== '' ? String(raw.correctAnswer) : undefined;
  let type: QuestionType = QUESTION_TYPES.includes(raw.type) ? raw.type : 'MULTIPLE_CHOICE';
  let options = Array.isArray(raw.options)
    ? raw.options
        .map((option: any) => typeof option === 'string'
          ? { text: option, isCorrect: !!correctAnswer && (option === correctAnswer || option.startsWith(correctAnswer)) }
          : { text: String(option?.text ?? ''), isCorrect: Boolean(option?.isCorrect) })
        .filter((option: { text: string }) => option.text)
    : [];

  if (type === 'MULTIPLE_CHOICE' && options.length < 2) type = 'SHORT_ANSWER';
  if (type === 'TRUE_FALSE' && options.length !== 2) {
    const answer = correctAnswer?.toLowerCase();
    options = [{ text: 'True', isCorrect: answer === 'true' }, { text: 'False', isCorrect: answer === 'false' }];
  }
  if (type === 'SHORT_ANSWER' || type === 'ESSAY') options = [];

  return {
    text,
    type,
    points: Math.max(1, Math.round(Number(raw.points ?? raw.marks) || 1)),
    options,
    correctAnswer,
  };
}

function parseQuestions(content: string): GeneratedQuestion[] {
  let parsed: unknown;
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeQuestion).filter((q): q is GeneratedQuestion => q !== null);
}

/** Returns normalized questions; an empty array means the AI response could not be used. */
export async function generateQuestions(input: ContentInput & {
  count: number;
  types?: string[];
  difficulty?: string;
}): Promise<GeneratedQuestion[]> {
  const requested = (input.types || []).filter((t): t is QuestionType => QUESTION_TYPES.includes(t as QuestionType));
  const types = requested.length ? requested : DEFAULT_QUESTION_TYPES;
  const reference = await curriculumReference(input, 4000, 'Align the questions with this official Zambian CDC content.');

  const prompt = `Generate exactly ${input.count} assessment questions for Zambian learners.

${describeContext(input)}
DIFFICULTY: ${input.difficulty || 'medium'}
QUESTION TYPES TO USE: ${types.map(t => QUESTION_TYPE_LABELS[t]).join(', ')}
${reference}
Return ONLY a valid JSON array (no markdown, no explanation) in this exact format:
[
  {"text": "Question text", "type": "MULTIPLE_CHOICE", "points": 2, "options": [{"text": "Option A", "isCorrect": true}, {"text": "Option B", "isCorrect": false}, {"text": "Option C", "isCorrect": false}, {"text": "Option D", "isCorrect": false}]},
  {"text": "Statement", "type": "TRUE_FALSE", "points": 1, "options": [{"text": "True", "isCorrect": true}, {"text": "False", "isCorrect": false}]},
  {"text": "Question text", "type": "SHORT_ANSWER", "points": 3, "correctAnswer": "Expected answer"}
]

Requirements:
- Age-appropriate, clear simple English, Zambian context where relevant
- Cover the subtopics evenly
- MULTIPLE_CHOICE: exactly 4 options, exactly one correct
- TRUE_FALSE: options True and False
- SHORT_ANSWER and ESSAY: include correctAnswer with the expected answer or marking points
- Give each question 1-5 points according to its difficulty`;

  const response = await aiService.chat(
    [{ role: 'user', content: prompt }],
    { temperature: 0.5, maxTokens: Math.min(6000, 600 + input.count * 200) },
  );
  return parseQuestions(response.content);
}

export async function generateHomeworkText(input: ContentInput & { homeworkType?: string }): Promise<string> {
  const label = input.homeworkType === 'PROJECT' ? 'project assignment' : 'homework assignment';
  const reference = await curriculumReference(input, 4000, `Align the ${label} with this official Zambian CDC content.`);

  const prompt = `Generate a ${label} for Zambian learners.

${describeContext(input)}
${reference}
Structure it as:
1. **Title** — a clear, descriptive title
2. **Instructions** — what the learner needs to do (2-3 short paragraphs)
3. **Tasks/Questions** — 3-5 specific tasks or questions
4. **Marking Guide** — how marks are allocated, ending with "Total: N marks"

Write in clear, simple English and use Zambian context where relevant.${gradeGuidance(input.gradeLevel)}`;

  const response = await aiService.chat([{ role: 'user', content: prompt }], { temperature: 0.6, maxTokens: 1500 });
  return response.content;
}

/** Reads "Total: N marks" from generated homework, falling back when absent. */
export function extractTotalMarks(content: string, fallback: number): number {
  const match = content.match(/total[:\s*]*(\d+)\s*marks/i);
  const marks = match ? Number(match[1]) : NaN;
  return marks > 0 && marks <= 999 ? marks : fallback;
}
