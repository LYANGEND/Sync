import { prisma } from '../utils/prisma';
import { aiTutorService, LESSON_PHASES } from './aiTutorService';
import { syncClassroomAttendance } from './classroomAttendanceService';
import { emitClassroomUpdated } from './classroomRealtimeService';
import {
  buildRuntimeLessonPlan,
  getCurrentSegment,
  getSegmentPromptSummary,
  RuntimeLessonPlan,
  RuntimeLessonSegment,
} from './lessonPlanRuntimeService';

const CLASSROOM_CHECK_INTERVAL_MS = 30 * 1000;
const WRAP_UP_WINDOW_MS = 5 * 60 * 1000;

type AutomatedPhase = typeof LESSON_PHASES[number];

type ActiveTutorSession = {
  id: string;
  lessonPhase: string;
  currentTopic: string | null;
  topicIndex: number;
};

const PHASE_INDEX = LESSON_PHASES.reduce<Record<AutomatedPhase, number>>((acc, phase, index) => {
  acc[phase] = index;
  return acc;
}, {} as Record<AutomatedPhase, number>);

let schedulerHandle: NodeJS.Timeout | null = null;
let isRunning = false;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPhaseIndex(phase: string | null | undefined) {
  if (!phase || !(phase in PHASE_INDEX)) {
    return PHASE_INDEX.GREETING;
  }

  return PHASE_INDEX[phase as AutomatedPhase];
}

function shouldTransitionToSegment(session: ActiveTutorSession, targetSegment: RuntimeLessonSegment) {
  const currentPhaseIndex = getPhaseIndex(session.lessonPhase);
  const targetPhaseIndex = getPhaseIndex(targetSegment.phase);

  if (targetPhaseIndex < currentPhaseIndex) {
    return false;
  }

  if (targetPhaseIndex > currentPhaseIndex) {
    return true;
  }

  if (targetSegment.index < (session.topicIndex || 0)) {
    return false;
  }

  return session.topicIndex !== targetSegment.index || session.currentTopic !== targetSegment.title;
}

function getScheduleMetrics(classroom: {
  actualStart: Date | null;
  scheduledStart: Date;
  scheduledEnd: Date;
}, now: Date) {
  const effectiveStart = classroom.actualStart || classroom.scheduledStart;
  const totalMs = Math.max(classroom.scheduledEnd.getTime() - effectiveStart.getTime(), 60_000);
  const elapsedMs = clamp(now.getTime() - effectiveStart.getTime(), 0, totalMs);
  const remainingMs = Math.max(classroom.scheduledEnd.getTime() - now.getTime(), 0);

  return {
    elapsedMinutes: Math.round(elapsedMs / 60_000),
    remainingMinutes: Math.ceil(remainingMs / 60_000),
    progress: clamp(elapsedMs / totalMs, 0, 1),
  };
}

function getWrapUpSegment(plan: RuntimeLessonPlan) {
  return [...plan.segments].reverse().find(segment => segment.phase === 'WRAP_UP') || plan.segments[plan.segments.length - 1];
}

function getTargetSegment(
  classroom: {
    actualStart: Date | null;
    scheduledStart: Date;
    scheduledEnd: Date;
  },
  plan: RuntimeLessonPlan,
  now: Date
) {
  const metrics = getScheduleMetrics(classroom, now);
  const remainingMs = Math.max(classroom.scheduledEnd.getTime() - now.getTime(), 0);

  if (remainingMs <= WRAP_UP_WINDOW_MS) {
    return getWrapUpSegment(plan);
  }

  return getCurrentSegment(plan, metrics.elapsedMinutes);
}

function buildAutomationPrompt(
  segment: RuntimeLessonSegment,
  plan: RuntimeLessonPlan,
  elapsedMinutes: number,
  remainingMinutes: number
) {
  const segmentMinutesRemaining = Math.max(segment.endMinute - elapsedMinutes, 1);

  return [
    `The class is ${elapsedMinutes} minutes in and about ${remainingMinutes} minutes remain overall.`,
    `Transition into segment ${segment.index + 1} of ${plan.segments.length}: "${segment.title}".`,
    `There are about ${segmentMinutesRemaining} minutes left in this segment.`,
    getSegmentPromptSummary(segment, plan),
    `Keep the class moving naturally and avoid sounding mechanical while staying on schedule.`,
  ].join(' ');
}

async function ensureTutorSession(
  classroomId: string,
  options: { generateAudio: boolean; allowRestart: boolean }
): Promise<ActiveTutorSession | null> {
  const activeSession = await prisma.aITutorSession.findFirst({
    where: {
      classroomId,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      lessonPhase: true,
      currentTopic: true,
      topicIndex: true,
    },
  });

  if (activeSession) {
    return activeSession;
  }

  if (!options.allowRestart) {
    const existingSessionCount = await prisma.aITutorSession.count({
      where: { classroomId },
    });

    if (existingSessionCount > 0) {
      return null;
    }
  }

  const started = await aiTutorService.startSession(classroomId, {
    generateAudio: options.generateAudio,
  });
  const startedSession = await prisma.aITutorSession.findUnique({
    where: { id: started.sessionId },
    select: {
      id: true,
      lessonPhase: true,
      currentTopic: true,
      topicIndex: true,
    },
  });

  return startedSession || {
    id: started.sessionId,
    lessonPhase: 'GREETING',
    currentTopic: null,
    topicIndex: 0,
  };
}

async function startDueClassrooms(now: Date) {
  const dueClassrooms = await prisma.virtualClassroom.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledStart: { lte: now },
      scheduledEnd: { gt: now },
    },
    select: {
      id: true,
      title: true,
      aiTutorEnabled: true,
    },
  });

  for (const classroom of dueClassrooms) {
    const started = await prisma.virtualClassroom.updateMany({
      where: {
        id: classroom.id,
        status: 'SCHEDULED',
      },
      data: {
        status: 'LIVE',
        actualStart: now,
      },
    });

    if (started.count === 0) {
      continue;
    }

    console.log(`[ClassroomAutomation] Started "${classroom.title}"`);
    emitClassroomUpdated(classroom.id, { reason: 'automation_class_started' });

    if (classroom.aiTutorEnabled) {
      try {
        await ensureTutorSession(classroom.id, {
          generateAudio: true,
          allowRestart: true,
        });
      } catch (error) {
        console.error(`[ClassroomAutomation] Failed to start AI tutor for "${classroom.title}":`, error);
      }
    }
  }
}

async function closeExpiredScheduledClassrooms(now: Date) {
  const expiredClassrooms = await prisma.virtualClassroom.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledEnd: { lte: now },
    },
    select: {
      id: true,
      title: true,
    },
  });

  for (const classroom of expiredClassrooms) {
    const ended = await prisma.virtualClassroom.updateMany({
      where: {
        id: classroom.id,
        status: 'SCHEDULED',
      },
      data: {
        status: 'ENDED',
        actualEnd: now,
      },
    });

    if (ended.count > 0) {
      console.log(`[ClassroomAutomation] Marked missed classroom "${classroom.title}" as ended`);
      emitClassroomUpdated(classroom.id, { reason: 'automation_class_missed' });
    }
  }
}

async function progressLiveClassrooms(now: Date) {
  const liveClassrooms = await prisma.virtualClassroom.findMany({
    where: {
      status: 'LIVE',
      aiTutorEnabled: true,
      scheduledEnd: { gt: now },
    },
    select: {
      id: true,
      title: true,
      actualStart: true,
      scheduledStart: true,
      scheduledEnd: true,
      topicId: true,
      selectedSubTopicIds: true,
      lessonPlanContent: true,
    },
  });

  for (const classroom of liveClassrooms) {
    try {
      const session = await ensureTutorSession(classroom.id, {
        generateAudio: true,
        allowRestart: false,
      });

      if (!session) {
        continue;
      }

      const runtimePlan = await buildRuntimeLessonPlan({
        title: classroom.title,
        scheduledStart: classroom.scheduledStart,
        scheduledEnd: classroom.scheduledEnd,
        topicId: classroom.topicId,
        selectedSubTopicIds: classroom.selectedSubTopicIds,
        lessonPlanContent: classroom.lessonPlanContent,
      });
      const targetSegment = getTargetSegment(classroom, runtimePlan, now);

      if (!shouldTransitionToSegment(session, targetSegment)) {
        continue;
      }

      const metrics = getScheduleMetrics(classroom, now);
      await aiTutorService.transitionToPhase(session.id, targetSegment.phase as AutomatedPhase, {
        generateAudio: true,
        prompt: buildAutomationPrompt(targetSegment, runtimePlan, metrics.elapsedMinutes, metrics.remainingMinutes),
        currentTopic: targetSegment.title,
        topicIndex: targetSegment.index,
        segmentObjectives: targetSegment.objectives,
        segmentTalkingPoints: targetSegment.talkingPoints,
        segmentIndex: targetSegment.index + 1,
        totalSegments: runtimePlan.segments.length,
      });

      console.log(
        `[ClassroomAutomation] Advanced "${classroom.title}" to ${targetSegment.phase} -> ${targetSegment.title} ` +
        `(${metrics.elapsedMinutes}m elapsed, ${metrics.remainingMinutes}m remaining)`
      );
      emitClassroomUpdated(classroom.id, { reason: 'automation_segment_advanced' });
    } catch (error) {
      console.error(`[ClassroomAutomation] Failed to progress "${classroom.title}":`, error);
    }
  }
}

async function endDueClassrooms(now: Date) {
  const dueClassrooms = await prisma.virtualClassroom.findMany({
    where: {
      status: 'LIVE',
      scheduledEnd: { lte: now },
    },
    select: {
      id: true,
      title: true,
    },
  });

  for (const classroom of dueClassrooms) {
    try {
      const activeSessions = await prisma.aITutorSession.findMany({
        where: {
          classroomId: classroom.id,
          status: 'ACTIVE',
        },
        select: {
          id: true,
        },
      });

      for (const session of activeSessions) {
        await aiTutorService.endSession(session.id);
      }

      const ended = await prisma.virtualClassroom.updateMany({
        where: {
          id: classroom.id,
          status: 'LIVE',
        },
        data: {
          status: 'ENDED',
          actualEnd: now,
        },
      });

      if (ended.count > 0) {
        const attendanceSync = await syncClassroomAttendance(classroom.id);
        console.log(`[ClassroomAutomation] Ended "${classroom.title}"`);
        emitClassroomUpdated(classroom.id, { reason: 'automation_class_ended' });
        if (attendanceSync.synced) {
          console.log(
            `[ClassroomAutomation] Attendance synced for "${classroom.title}": ` +
            `${attendanceSync.presentCount} present, ${attendanceSync.lateCount} late, ${attendanceSync.absentCount} absent`
          );
        } else if (attendanceSync.skippedReason) {
          console.log(
            `[ClassroomAutomation] Attendance sync skipped for "${classroom.title}": ${attendanceSync.skippedReason}`
          );
        }
      }
    } catch (error) {
      console.error(`[ClassroomAutomation] Failed to end "${classroom.title}":`, error);
    }
  }
}

export async function runClassroomAutomationCycle() {
  if (isRunning) {
    return;
  }

  isRunning = true;
  const now = new Date();

  try {
    await closeExpiredScheduledClassrooms(now);
    await startDueClassrooms(now);
    await progressLiveClassrooms(now);
    await endDueClassrooms(now);
  } finally {
    isRunning = false;
  }
}

export function initClassroomAutomationScheduler() {
  if (schedulerHandle) {
    return;
  }

  schedulerHandle = setInterval(() => {
    runClassroomAutomationCycle().catch((error) => {
      console.error('[ClassroomAutomation] Scheduler cycle failed:', error);
    });
  }, CLASSROOM_CHECK_INTERVAL_MS);

  console.log(
    `[ClassroomAutomation] Initialized - checking scheduled classrooms every ${CLASSROOM_CHECK_INTERVAL_MS / 1000}s ` +
    `with wrap-up prompts in the last ${WRAP_UP_WINDOW_MS / 60_000} minutes`
  );

  runClassroomAutomationCycle().catch((error) => {
    console.error('[ClassroomAutomation] Initial scheduler cycle failed:', error);
  });
}
