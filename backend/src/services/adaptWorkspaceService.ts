import { prisma } from '../utils/prisma';
import aiService from './aiService';

/**
 * ADAPT WORKSPACE SERVICE
 * 
 * Turns approved AI reteach drafts into actionable, customisable lesson plans.
 * 
 * Safety rules (inherited from TeachingHubService):
 *   1. AI only *suggests* activities — teacher always edits & approves before deployment.
 *   2. Deterministic data (mastery scores, student lists) are never AI-generated.
 *   3. Every AI call returns strict JSON; invalid responses are caught and surfaced.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface LessonActivity {
  type: 'WARM_UP' | 'DIRECT_INSTRUCTION' | 'GUIDED_PRACTICE' | 'INDEPENDENT' | 'ASSESSMENT' | 'EXTENSION';
  title: string;
  description: string;
  durationMinutes: number;
  materials?: string[];
  differentiation?: string;   // How to adjust for advanced / struggling learners
}

interface CreateFromActionInput {
  teacherId: string;
  actionId: string;
}

interface GenerateActivitiesInput {
  lessonId: string;
  additionalContext?: string;  // Teacher can add notes like "my class responds to songs"
}

// ── Service ──────────────────────────────────────────────────────────

export class AdaptWorkspaceService {

  /**
   * Create a new adapted lesson from an approved PendingTeacherAction.
   * Seeds it with the AI-drafted reteach steps already stored in draftPayload.
   */
  static async createFromAction({ teacherId, actionId }: CreateFromActionInput) {
    // 1. Load the approved action
    const action = await prisma.pendingTeacherAction.findUnique({
      where: { id: actionId },
      include: { class: true },
    });

    if (!action) throw new Error('Action not found');
    if (action.teacherId !== teacherId) throw new Error('Not your action');
    if (action.status !== 'APPROVED') throw new Error('Action must be APPROVED before creating a lesson');

    // 2. Extract the draft payload written by the AI diagnosis step
    const draft = action.draftPayload as any;

    // 3. Resolve the subTopic — the action links to a class, 
    //    and the diagnosis title tells us the topic. We look for
    //    a MisconceptionPattern created around the same time.
    const pattern = await prisma.misconceptionPattern.findFirst({
      where: {
        assessmentId: { not: undefined },
        description: draft?.explanation,
      },
      select: { subTopicId: true },
      orderBy: { createdAt: 'desc' },
    });

    // Fallback: find any subtopic for this class's subjects
    let subTopicId = pattern?.subTopicId;
    if (!subTopicId) {
      // Find a subtopic via the class's timetable → subject → topic → subtopic
      const periodClass = await prisma.timetablePeriodClass.findFirst({
        where: { classId: action.classId! },
        include: {
          timetablePeriod: {
            include: { subject: { include: { topics: { include: { subtopics: { take: 1 } }, take: 1 } } } },
          },
        },
      });
      subTopicId = periodClass?.timetablePeriod?.subject?.topics?.[0]?.subtopics?.[0]?.id;
    }

    if (!subTopicId) throw new Error('Could not resolve a subtopic for this action');

    // 4. Convert the drafted reteach steps into structured activities
    const reteachSteps: string[] = draft?.reteachSteps || [];
    const activities: LessonActivity[] = reteachSteps.map((step: string, idx: number) => ({
      type: idx === 0 ? 'WARM_UP' : idx === reteachSteps.length - 1 ? 'ASSESSMENT' : 'GUIDED_PRACTICE',
      title: `Step ${idx + 1}`,
      description: step,
      durationMinutes: 10,
    }));

    // 5. Find struggling students for this subTopic (pre-fill targetStudentIds)
    const urgentStudents = await prisma.learningObjectiveMastery.findMany({
      where: {
        classId: action.classId!,
        subTopicId,
        status: { in: ['URGENT', 'FRAGILE'] },
        studentId: { not: null },
      },
      select: { studentId: true },
    });

    const targetStudentIds = urgentStudents
      .map(s => s.studentId)
      .filter((id): id is string => id !== null);

    // 6. Create the AdaptedLesson
    const lesson = await prisma.adaptedLesson.create({
      data: {
        teacherId,
        classId: action.classId!,
        subTopicId,
        title: draft?.diagnosisTitle || action.title,
        objective: draft?.explanation || action.description,
        activities: activities as any,
        targetStudentIds,
        sourceActionId: action.id,
        status: 'DRAFT',
      },
      include: {
        class: { select: { name: true } },
        subTopic: { select: { title: true, topic: { select: { title: true } } } },
      },
    });

    console.log(`[AdaptWorkspace] Lesson created: ${lesson.id} from action ${actionId}`);
    return lesson;
  }

  /**
   * AI-powered activity generator.
   * Takes the current lesson context and generates differentiated activities.
   * Teacher MUST review before deploying.
   */
  static async generateActivities({ lessonId, additionalContext }: GenerateActivitiesInput) {
    const lesson = await prisma.adaptedLesson.findUnique({
      where: { id: lessonId },
      include: {
        subTopic: { select: { title: true, topic: { select: { title: true } } } },
        class: { select: { name: true, gradeLevel: true } },
      },
    });

    if (!lesson) throw new Error('Lesson not found');

    // Gather mastery data for context
    const masteryData = await prisma.learningObjectiveMastery.findMany({
      where: { classId: lesson.classId, subTopicId: lesson.subTopicId },
      include: { student: { select: { firstName: true, lastName: true } } },
    });

    const classAvg = masteryData.length > 0
      ? masteryData.reduce((sum, m) => sum + Number(m.masteryScore), 0) / masteryData.length
      : 0;

    const existingActivities = (lesson.activities as any[]) || [];

    const prompt = `
You are a Zambian curriculum specialist helping a primary school teacher create a differentiated lesson plan.

CONTEXT:
- Class: ${lesson.class.name} (Grade ${lesson.class.gradeLevel})
- Topic: ${lesson.subTopic.topic.title} → ${lesson.subTopic.title}
- Lesson objective: ${lesson.objective}
- Current class average mastery: ${classAvg.toFixed(1)}%
- Number of struggling students: ${lesson.targetStudentIds.length}
- Existing steps in the plan: ${existingActivities.map((a: any) => a.description).join(' | ')}
${additionalContext ? `- Teacher notes: ${additionalContext}` : ''}

TASK:
Generate exactly 5 activities for a 40-minute lesson that addresses the identified misconception.
Each activity MUST be practical, use locally-available materials (no technology required), and be appropriate for the Zambian classroom context.

Include differentiation tips so the teacher can support both struggling and advanced learners.

Respond ONLY with this JSON structure:
{
  "activities": [
    {
      "type": "WARM_UP" | "DIRECT_INSTRUCTION" | "GUIDED_PRACTICE" | "INDEPENDENT" | "ASSESSMENT",
      "title": "short title",
      "description": "what the teacher does — be specific and practical",
      "durationMinutes": number,
      "materials": ["item1", "item2"],
      "differentiation": "how to adapt for struggling vs advanced learners"
    }
  ]
}`;

    const result = await aiService.generateJSON<{ activities: LessonActivity[] }>(prompt, {
      systemPrompt: 'You are an expert Zambian primary school curriculum advisor. You only output valid JSON.',
      temperature: 0.3,
    });

    // Merge: keep existing activities, append AI suggestions marked for review
    const aiActivities = (result.activities || []).map(a => ({
      ...a,
      _aiGenerated: true,  // Frontend can show a badge
    }));

    // Update the lesson with the combined activities
    const updated = await prisma.adaptedLesson.update({
      where: { id: lessonId },
      data: {
        activities: [...existingActivities, ...aiActivities] as any,
      },
      include: {
        class: { select: { name: true } },
        subTopic: { select: { title: true, topic: { select: { title: true } } } },
      },
    });

    console.log(`[AdaptWorkspace] Generated ${aiActivities.length} activities for lesson ${lessonId}`);
    return updated;
  }

  /**
   * Update a lesson — teacher edits title, objective, activities, target students, schedule.
   */
  static async updateLesson(lessonId: string, teacherId: string, updates: {
    title?: string;
    objective?: string;
    activities?: LessonActivity[];
    targetStudentIds?: string[];
    scheduledDate?: string;
  }) {
    const lesson = await prisma.adaptedLesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new Error('Lesson not found');
    if (lesson.teacherId !== teacherId) throw new Error('Not your lesson');

    const data: any = {};
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.objective !== undefined) data.objective = updates.objective;
    if (updates.activities !== undefined) data.activities = updates.activities;
    if (updates.targetStudentIds !== undefined) data.targetStudentIds = updates.targetStudentIds;
    if (updates.scheduledDate !== undefined) data.scheduledDate = new Date(updates.scheduledDate);

    const updated = await prisma.adaptedLesson.update({
      where: { id: lessonId },
      data,
      include: {
        class: { select: { name: true } },
        subTopic: { select: { title: true, topic: { select: { title: true } } } },
      },
    });

    return updated;
  }

  /**
   * Change lesson status: DRAFT → READY → DEPLOYED → COMPLETED
   */
  static async changeStatus(lessonId: string, teacherId: string, newStatus: string) {
    const lesson = await prisma.adaptedLesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new Error('Lesson not found');
    if (lesson.teacherId !== teacherId) throw new Error('Not your lesson');

    const validTransitions: Record<string, string[]> = {
      'DRAFT': ['READY'],
      'READY': ['DEPLOYED', 'DRAFT'],  // Can go back to draft for more edits
      'DEPLOYED': ['COMPLETED'],
      'COMPLETED': [],
    };

    if (!validTransitions[lesson.status]?.includes(newStatus)) {
      throw new Error(`Cannot transition from ${lesson.status} to ${newStatus}`);
    }

    const data: any = { status: newStatus };
    if (newStatus === 'COMPLETED') data.completedDate = new Date();

    const updated = await prisma.adaptedLesson.update({
      where: { id: lessonId },
      data,
      include: {
        class: { select: { name: true } },
        subTopic: { select: { title: true, topic: { select: { title: true } } } },
      },
    });

    console.log(`[AdaptWorkspace] Lesson ${lessonId} → ${newStatus}`);
    return updated;
  }
}
