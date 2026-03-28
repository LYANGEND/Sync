import { prisma } from '../utils/prisma';

export type RuntimeLessonPhase =
  | 'GREETING'
  | 'ATTENDANCE'
  | 'RECAP'
  | 'TEACHING'
  | 'Q_AND_A'
  | 'ACTIVITY'
  | 'WRAP_UP';

export interface RuntimeLessonSegment {
  index: number;
  phase: RuntimeLessonPhase;
  title: string;
  durationMinutes: number;
  startMinute: number;
  endMinute: number;
  objectives: string[];
  talkingPoints: string[];
  instructions: string;
  subTopicId?: string;
}

export interface RuntimeLessonPlan {
  title: string;
  source: 'SYLLABUS' | 'TEXT' | 'FALLBACK';
  totalDurationMinutes: number;
  subjectName?: string | null;
  topicTitle?: string | null;
  segments: RuntimeLessonSegment[];
}

export interface RuntimeLessonSnapshot {
  title: string;
  source: RuntimeLessonPlan['source'];
  totalDurationMinutes: number;
  elapsedMinutes: number;
  remainingMinutes: number;
  progress: number;
  isWrapUpWindow: boolean;
  currentSegment: RuntimeLessonSegment | null;
  nextSegment: RuntimeLessonSegment | null;
  currentSegmentElapsedMinutes: number;
  currentSegmentRemainingMinutes: number;
  currentSegmentProgress: number;
  tutorPhase?: string | null;
  tutorCurrentTopic?: string | null;
  segments: RuntimeLessonSegment[];
}

export interface ClassroomLessonPlanContext {
  title?: string | null;
  subjectName?: string | null;
  scheduledStart?: Date | string | null;
  scheduledEnd?: Date | string | null;
  topicId?: string | null;
  selectedSubTopicIds?: unknown;
  lessonPlanContent?: string | null;
}

interface ParsedPlanSection {
  title: string;
  phase: RuntimeLessonPhase;
  durationMinutes?: number;
  body: string;
}

type DurationMap = Record<RuntimeLessonPhase, number>;
const WRAP_UP_WINDOW_MS = 5 * 60 * 1000;

const SECTION_PHASE_RULES: Array<{ phase: RuntimeLessonPhase; matches: string[] }> = [
  { phase: 'WRAP_UP', matches: ['wrap up', 'wrap-up', 'summary', 'conclusion', 'closing'] },
  { phase: 'Q_AND_A', matches: ['assessment', 'quiz', 'q&a', 'q & a', 'questions', 'check understanding'] },
  { phase: 'ACTIVITY', matches: ['activity', 'exercise', 'practice', 'guided practice', 'group work'] },
  { phase: 'TEACHING', matches: ['teaching', 'main topic', 'main lesson', 'development', 'presentation', 'instruction'] },
  { phase: 'RECAP', matches: ['introduction', 'intro', 'recap', 'review', 'starter', 'hook', 'objectives'] },
];

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTotalDurationMinutes(context: Pick<ClassroomLessonPlanContext, 'scheduledStart' | 'scheduledEnd'>, fallback = 45) {
  const start = toDate(context.scheduledStart);
  const end = toDate(context.scheduledEnd);
  if (!start || !end) return fallback;

  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  return Math.max(minutes, 15);
}

function normalizeSubTopicIds(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  return [];
}

function parseObjectives(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function normalizeHeading(text: string) {
  return text
    .toLowerCase()
    .replace(/[*_#:`]/g, '')
    .replace(/\(\s*\d+\s*(?:min|minutes?)\s*\)/g, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDurationFromText(text: string) {
  const match = text.match(/(\d+)\s*(?:min|minutes?)/i);
  if (!match) return undefined;

  const minutes = Number(match[1]);
  return Number.isFinite(minutes) ? minutes : undefined;
}

function detectPhaseFromHeading(heading: string): RuntimeLessonPhase | null {
  const normalized = normalizeHeading(heading);
  for (const rule of SECTION_PHASE_RULES) {
    if (rule.matches.some(match => normalized.includes(match))) {
      return rule.phase;
    }
  }

  return null;
}

function parseStructuredSectionsFromText(content: string) {
  const lines = content.split(/\r?\n/);
  const sections: ParsedPlanSection[] = [];
  let current: ParsedPlanSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const detectedPhase = detectPhaseFromHeading(line);

    if (detectedPhase && line.length <= 90) {
      if (current) {
        current.body = current.body.trim();
        if (current.body) sections.push(current);
      }

      current = {
        title: line.replace(/[*#]/g, '').trim(),
        phase: detectedPhase,
        durationMinutes: parseDurationFromText(line),
        body: '',
      };
      continue;
    }

    if (current) {
      current.body += `${rawLine}\n`;
    }
  }

  if (current) {
    current.body = current.body.trim();
    if (current.body) sections.push(current);
  }

  return sections;
}

function extractTalkingPoints(body: string) {
  const bulletMatches = body.match(/(?:^|\n)\s*(?:[-*]|\d+\.)\s+(.+)/g) || [];
  const bullets = bulletMatches
    .map(item => item.replace(/(?:^|\n)\s*(?:[-*]|\d+\.)\s+/, '').trim())
    .filter(Boolean);

  if (bullets.length > 0) {
    return bullets.slice(0, 5);
  }

  return body
    .split(/\n+/)
    .map(line => line.replace(/\*\*/g, '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

function distributeMinutes(total: number, weights: number[]) {
  if (weights.length === 0) return [];

  const safeTotal = Math.max(total, weights.length);
  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(weight, 0.1), 0);
  const raw = weights.map(weight => (safeTotal * Math.max(weight, 0.1)) / totalWeight);
  const base = raw.map(value => Math.max(1, Math.floor(value)));
  let assigned = base.reduce((sum, value) => sum + value, 0);

  const byRemainder = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  let pointer = 0;
  while (assigned < safeTotal) {
    base[byRemainder[pointer % byRemainder.length].index] += 1;
    assigned += 1;
    pointer += 1;
  }

  pointer = byRemainder.length - 1;
  while (assigned > safeTotal) {
    const target = byRemainder[pointer >= 0 ? pointer : byRemainder.length - 1].index;
    if (base[target] > 1) {
      base[target] -= 1;
      assigned -= 1;
    }
    pointer -= 1;
  }

  return base;
}

function getBaselineDurations(totalDurationMinutes: number): DurationMap {
  const teachingShare = totalDurationMinutes >= 50 ? 0.46 : totalDurationMinutes >= 40 ? 0.44 : 0.4;
  const teachingMinutes = Math.max(6, Math.round(totalDurationMinutes * teachingShare));
  const remaining = Math.max(totalDurationMinutes - teachingMinutes, 6);
  const [greeting, attendance, recap, activity, questionTime, wrapUp] = distributeMinutes(remaining, [1, 1, 1, 2, 2, 2]);

  return {
    GREETING: greeting,
    ATTENDANCE: attendance,
    RECAP: recap,
    TEACHING: teachingMinutes,
    ACTIVITY: activity,
    Q_AND_A: questionTime,
    WRAP_UP: wrapUp,
  };
}

function createSegment(
  segments: RuntimeLessonSegment[],
  phase: RuntimeLessonPhase,
  title: string,
  durationMinutes: number,
  objectives: string[],
  talkingPoints: string[],
  instructions: string,
  extra: Partial<Pick<RuntimeLessonSegment, 'subTopicId'>> = {}
) {
  const safeDuration = Math.max(durationMinutes, 1);
  const last = segments[segments.length - 1];
  const startMinute = last ? last.endMinute : 0;

  segments.push({
    index: segments.length,
    phase,
    title,
    durationMinutes: safeDuration,
    startMinute,
    endMinute: startMinute + safeDuration,
    objectives,
    talkingPoints,
    instructions,
    ...extra,
  });
}

function finalizePlan(
  title: string,
  source: RuntimeLessonPlan['source'],
  totalDurationMinutes: number,
  segments: RuntimeLessonSegment[],
  meta: Pick<RuntimeLessonPlan, 'subjectName' | 'topicTitle'>
): RuntimeLessonPlan {
  if (segments.length === 0) {
    return buildFallbackRuntimeLessonPlan({
      title,
      subjectName: meta.subjectName,
      scheduledStart: null,
      scheduledEnd: null,
    });
  }

  const actualTotal = segments[segments.length - 1].endMinute;

  return {
    title,
    source,
    totalDurationMinutes: actualTotal || totalDurationMinutes,
    subjectName: meta.subjectName,
    topicTitle: meta.topicTitle,
    segments,
  };
}

export function buildFallbackRuntimeLessonPlan(context: ClassroomLessonPlanContext): RuntimeLessonPlan {
  const totalDurationMinutes = getTotalDurationMinutes(context);
  const durations = getBaselineDurations(totalDurationMinutes);
  const segments: RuntimeLessonSegment[] = [];

  createSegment(segments, 'GREETING', 'Welcome and settle the class', durations.GREETING, [], [
    'Welcome students warmly',
    'Set expectations for the lesson',
  ], 'Open confidently and prepare the room for learning.');
  createSegment(segments, 'ATTENDANCE', 'Take attendance and acknowledge arrivals', durations.ATTENDANCE, [], [
    'Check who is present',
    'Acknowledge late joiners without slowing the class',
  ], 'Keep attendance brisk so the class can move into instruction.');
  createSegment(segments, 'RECAP', 'Reconnect to prior knowledge and introduce objectives', durations.RECAP, [], [
    'Review what students already know',
    'Frame the lesson objective in simple language',
  ], 'Use a short hook or recap before new teaching starts.');
  createSegment(segments, 'TEACHING', context.title || 'Main teaching block', durations.TEACHING, [], [
    'Teach the core concept clearly',
    'Check understanding as you go',
  ], 'Teach the main ideas in a clear sequence and stay responsive to confusion.');
  createSegment(segments, 'ACTIVITY', 'Guided activity or practice', durations.ACTIVITY, [], [
    'Give students a short task',
    'Circulate with feedback',
  ], 'Use guided practice to reinforce the main concept.');
  createSegment(segments, 'Q_AND_A', 'Check understanding and answer questions', durations.Q_AND_A, [], [
    'Invite focused questions',
    'Clarify misconceptions',
  ], 'Use this time to verify that students are following.');
  createSegment(segments, 'WRAP_UP', 'Summarize and close the lesson', durations.WRAP_UP, [], [
    'Summarize key learning points',
    'Share homework or next steps',
  ], 'Land the lesson calmly and end on time.');

  return finalizePlan(
    context.title || 'Virtual Classroom Lesson Plan',
    'FALLBACK',
    totalDurationMinutes,
    segments,
    { subjectName: context.subjectName, topicTitle: null }
  );
}

export function buildRuntimeLessonPlanFromText(context: ClassroomLessonPlanContext): RuntimeLessonPlan | null {
  const content = context.lessonPlanContent?.trim();
  if (!content) return null;

  const parsedSections = parseStructuredSectionsFromText(content);
  if (parsedSections.length === 0) return null;

  const totalDurationMinutes = getTotalDurationMinutes(context);
  const setupDurations = distributeMinutes(Math.max(4, Math.round(totalDurationMinutes * 0.12)), [1, 1]);
  const hasWrapUp = parsedSections.some(section => section.phase === 'WRAP_UP');
  const wrapUpPadding = hasWrapUp ? 0 : 3;
  const instructionalBudget = Math.max(
    totalDurationMinutes - setupDurations.reduce((sum, value) => sum + value, 0) - wrapUpPadding,
    parsedSections.length
  );
  const weights = parsedSections.map(section => section.durationMinutes || (section.phase === 'TEACHING' ? 3 : 2));
  const sectionDurations = distributeMinutes(instructionalBudget, weights);
  const segments: RuntimeLessonSegment[] = [];

  createSegment(segments, 'GREETING', 'Welcome and set the tone', setupDurations[0], [], [
    'Welcome students',
    'Signal the lesson is beginning',
  ], 'Keep the opening warm and brief.');
  createSegment(segments, 'ATTENDANCE', 'Confirm attendance and readiness', setupDurations[1], [], [
    'Acknowledge who has joined',
    'Move quickly into the lesson',
  ], 'Minimize delay before instruction.');

  parsedSections.forEach((section, index) => {
    createSegment(
      segments,
      section.phase,
      section.title,
      sectionDurations[index],
      [],
      extractTalkingPoints(section.body),
      section.body
    );
  });

  if (!hasWrapUp) {
    createSegment(segments, 'WRAP_UP', 'Summarize and close the lesson', 3, [], [
      'Restate the main points',
      'Preview the next step',
    ], 'Add a concise close if the plan did not specify one.');
  }

  return finalizePlan(
    context.title || 'Virtual Classroom Lesson Plan',
    'TEXT',
    totalDurationMinutes,
    segments,
    { subjectName: context.subjectName, topicTitle: null }
  );
}

export async function buildRuntimeLessonPlanFromTopic(context: ClassroomLessonPlanContext): Promise<RuntimeLessonPlan | null> {
  if (!context.topicId) return null;

  const selectedSubTopicIds = normalizeSubTopicIds(context.selectedSubTopicIds);
  const topic = await prisma.topic.findUnique({
    where: { id: context.topicId },
    include: {
      subject: { select: { name: true } },
      subtopics: {
        where: selectedSubTopicIds.length > 0 ? { id: { in: selectedSubTopicIds } } : undefined,
        orderBy: { orderIndex: 'asc' },
      },
    },
  });

  if (!topic) return null;

  const totalDurationMinutes = getTotalDurationMinutes(context);
  const durations = getBaselineDurations(totalDurationMinutes);
  const teachingTargets = topic.subtopics.length > 0
    ? topic.subtopics
    : [{
      id: `${topic.id}-main`,
      title: topic.title,
      description: topic.description,
      learningObjectives: null,
      duration: null,
    }];
  const teachingWeights = teachingTargets.map(item => Math.max(item.duration || 0, 1));
  const teachingDurations = distributeMinutes(durations.TEACHING, teachingWeights);
  const topicObjectives = teachingTargets.flatMap(item => parseObjectives(item.learningObjectives)).slice(0, 6);
  const segments: RuntimeLessonSegment[] = [];

  createSegment(segments, 'GREETING', `Welcome to ${topic.title}`, durations.GREETING, [], [
    `Introduce ${topic.title}`,
    'Frame why this lesson matters',
  ], 'Welcome students and signal the lesson focus.');
  createSegment(segments, 'ATTENDANCE', 'Take attendance and settle the room', durations.ATTENDANCE, [], [
    'Acknowledge students who are present',
    'Note late arrivals without derailing the flow',
  ], 'Move briskly into the lesson.');
  createSegment(segments, 'RECAP', `Introduce the objectives for ${topic.title}`, durations.RECAP, topicObjectives, [
    topic.description || `Connect today\'s work to ${topic.title}`,
    ...topicObjectives.slice(0, 2),
  ].filter(Boolean), 'Use a short recap or hook, then outline what students should learn.');

  teachingTargets.forEach((subTopic, index) => {
    const objectives = parseObjectives(subTopic.learningObjectives);
    createSegment(
      segments,
      'TEACHING',
      subTopic.title,
      teachingDurations[index],
      objectives,
      [subTopic.description, ...objectives].filter((item): item is string => Boolean(item)).slice(0, 5),
      `Teach ${subTopic.title} clearly, check understanding, and link it back to the lesson objective.`,
      { subTopicId: subTopic.id }
    );
  });

  createSegment(segments, 'ACTIVITY', `${topic.title} practice activity`, durations.ACTIVITY, topicObjectives, [
    'Run a short guided task',
    'Let students apply what they have learned',
  ], 'Use an activity that reinforces the subtopics covered so far.');
  createSegment(segments, 'Q_AND_A', `${topic.title} check for understanding`, durations.Q_AND_A, topicObjectives, [
    'Invite focused questions',
    'Probe for misconceptions',
  ], 'Use this time for checks for understanding and clarification.');
  createSegment(segments, 'WRAP_UP', `Wrap up ${topic.title}`, durations.WRAP_UP, topicObjectives, [
    'Summarize the main learning points',
    'Share homework or preview the next class',
  ], 'Close the lesson on time and reinforce the big ideas.');

  return finalizePlan(
    context.title || topic.title,
    'SYLLABUS',
    totalDurationMinutes,
    segments,
    { subjectName: topic.subject.name, topicTitle: topic.title }
  );
}

export async function buildRuntimeLessonPlan(context: ClassroomLessonPlanContext): Promise<RuntimeLessonPlan> {
  const fromTopic = await buildRuntimeLessonPlanFromTopic(context);
  if (fromTopic) return fromTopic;

  const fromText = buildRuntimeLessonPlanFromText(context);
  if (fromText) return fromText;

  return buildFallbackRuntimeLessonPlan(context);
}

export function getCurrentSegment(plan: RuntimeLessonPlan, elapsedMinutes: number) {
  return plan.segments.find(segment => elapsedMinutes < segment.endMinute) || plan.segments[plan.segments.length - 1];
}

export function getLessonRuntimeSnapshot(
  plan: RuntimeLessonPlan,
  schedule: {
    actualStart?: Date | string | null;
    scheduledStart?: Date | string | null;
    scheduledEnd?: Date | string | null;
  },
  activeSession?: {
    lessonPhase?: string | null;
    currentTopic?: string | null;
    topicIndex?: number | null;
  } | null
): RuntimeLessonSnapshot {
  const scheduledStart = toDate(schedule.scheduledStart) || new Date();
  const scheduledEnd = toDate(schedule.scheduledEnd) || new Date(scheduledStart.getTime() + plan.totalDurationMinutes * 60_000);
  const effectiveStart = toDate(schedule.actualStart) || scheduledStart;
  const now = new Date();
  const totalMs = Math.max(scheduledEnd.getTime() - effectiveStart.getTime(), 60_000);
  const elapsedMs = clamp(now.getTime() - effectiveStart.getTime(), 0, totalMs);
  const remainingMs = Math.max(scheduledEnd.getTime() - now.getTime(), 0);
  const elapsedMinutes = Math.round(elapsedMs / 60_000);
  const remainingMinutes = Math.ceil(remainingMs / 60_000);
  const byTopicIndex = typeof activeSession?.topicIndex === 'number'
    ? plan.segments[activeSession.topicIndex] || null
    : null;
  const byCurrentTopic = activeSession?.currentTopic
    ? plan.segments.find(segment => segment.title === activeSession.currentTopic) || null
    : null;
  const scheduledSegment = getCurrentSegment(plan, elapsedMinutes);
  const currentSegment = byTopicIndex || byCurrentTopic || scheduledSegment || null;
  const nextSegment = currentSegment ? plan.segments[currentSegment.index + 1] || null : null;
  const currentSegmentElapsedMinutes = currentSegment
    ? clamp(elapsedMinutes - currentSegment.startMinute, 0, currentSegment.durationMinutes)
    : 0;
  const currentSegmentRemainingMinutes = currentSegment
    ? Math.max(currentSegment.endMinute - elapsedMinutes, 0)
    : 0;
  const currentSegmentProgress = currentSegment
    ? clamp(currentSegmentElapsedMinutes / Math.max(currentSegment.durationMinutes, 1), 0, 1)
    : 0;

  return {
    title: plan.title,
    source: plan.source,
    totalDurationMinutes: plan.totalDurationMinutes,
    elapsedMinutes,
    remainingMinutes,
    progress: clamp(elapsedMs / totalMs, 0, 1),
    isWrapUpWindow: remainingMs <= WRAP_UP_WINDOW_MS,
    currentSegment,
    nextSegment,
    currentSegmentElapsedMinutes,
    currentSegmentRemainingMinutes,
    currentSegmentProgress,
    tutorPhase: activeSession?.lessonPhase || currentSegment?.phase || null,
    tutorCurrentTopic: activeSession?.currentTopic || currentSegment?.title || null,
    segments: plan.segments,
  };
}

export function getSegmentPromptSummary(segment: RuntimeLessonSegment, plan: RuntimeLessonPlan) {
  const objectives = segment.objectives.length > 0
    ? `Objectives: ${segment.objectives.join('; ')}.`
    : '';
  const talkingPoints = segment.talkingPoints.length > 0
    ? `Talking points: ${segment.talkingPoints.join('; ')}.`
    : '';

  return [
    `Segment ${segment.index + 1} of ${plan.segments.length}: ${segment.title}.`,
    `Phase: ${segment.phase}. Estimated duration: ${segment.durationMinutes} minutes.`,
    objectives,
    talkingPoints,
    segment.instructions,
  ].filter(Boolean).join(' ');
}

export function renderRuntimeLessonPlan(plan: RuntimeLessonPlan) {
  const header = [
    `Subject: ${plan.subjectName || 'General'}`,
    plan.topicTitle ? `Topic: ${plan.topicTitle}` : null,
    `Duration: ${plan.totalDurationMinutes} minutes`,
    '',
    'Lesson Segments:',
  ].filter(Boolean);

  const lines = plan.segments.flatMap(segment => {
    const segmentLines = [
      `${segment.index + 1}. [${segment.phase}] ${segment.title} (${segment.durationMinutes} min)`,
    ];

    if (segment.objectives.length > 0) {
      segmentLines.push(`   Objectives: ${segment.objectives.join('; ')}`);
    }

    if (segment.talkingPoints.length > 0) {
      segment.talkingPoints.forEach(point => {
        segmentLines.push(`   - ${point}`);
      });
    }

    return segmentLines;
  });

  return [...header, ...lines].join('\n');
}
