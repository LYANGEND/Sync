import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../utils/prisma';
import { buildRuntimeLessonPlan, getLessonRuntimeSnapshot } from './lessonPlanRuntimeService';

let io: SocketIOServer | null = null;

export function setClassroomSocketServer(socketServer: SocketIOServer) {
  io = socketServer;
}

async function buildClassroomRealtimePayload(classroomId: string, payload: Record<string, unknown> = {}) {
  const classroom = await prisma.virtualClassroom.findUnique({
    where: { id: classroomId },
    select: {
      id: true,
      title: true,
      status: true,
      actualStart: true,
      actualEnd: true,
      scheduledStart: true,
      scheduledEnd: true,
      subjectId: true,
      topicId: true,
      selectedSubTopicIds: true,
      lessonPlanContent: true,
      participants: {
        where: { leftAt: null },
        select: { id: true },
      },
      tutorSessions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          status: true,
          lessonPhase: true,
          currentTopic: true,
          topicIndex: true,
        },
      },
      _count: {
        select: {
          participants: true,
          chatMessages: true,
        },
      },
    },
  });

  if (!classroom) {
    return {
      classroomId,
      ...payload,
    };
  }

  let subjectName: string | null = null;
  if (classroom.subjectId) {
    const subject = await prisma.subject.findUnique({
      where: { id: classroom.subjectId },
      select: { name: true },
    });
    subjectName = subject?.name || null;
  }

  const runtimePlan = await buildRuntimeLessonPlan({
    title: classroom.title,
    subjectName,
    scheduledStart: classroom.scheduledStart,
    scheduledEnd: classroom.scheduledEnd,
    topicId: classroom.topicId,
    selectedSubTopicIds: classroom.selectedSubTopicIds,
    lessonPlanContent: classroom.lessonPlanContent,
  });
  const latestSession = classroom.tutorSessions[0] || null;
  const lessonRuntime = getLessonRuntimeSnapshot(runtimePlan, {
    actualStart: classroom.actualStart,
    scheduledStart: classroom.scheduledStart,
    scheduledEnd: classroom.scheduledEnd,
  }, latestSession ? {
    lessonPhase: latestSession.lessonPhase,
    currentTopic: latestSession.currentTopic,
    topicIndex: latestSession.topicIndex,
  } : null);

  return {
    classroomId: classroom.id,
    status: classroom.status,
    actualStart: classroom.actualStart,
    actualEnd: classroom.actualEnd,
    lessonRuntime,
    tutorState: latestSession ? {
      active: latestSession.status === 'ACTIVE',
      sessionId: latestSession.id,
      phase: latestSession.lessonPhase,
      currentTopic: latestSession.currentTopic,
    } : {
      active: false,
      sessionId: null,
      phase: lessonRuntime.tutorPhase,
      currentTopic: lessonRuntime.tutorCurrentTopic,
    },
    participantCount: classroom._count.participants,
    activeParticipantCount: classroom.participants.length,
    chatMessageCount: classroom._count.chatMessages,
    ...payload,
  };
}

export function emitClassroomUpdated(classroomId: string, payload: Record<string, unknown> = {}) {
  if (!io) return;

  buildClassroomRealtimePayload(classroomId, payload)
    .then((data) => {
      io?.to(`classroom:${classroomId}`).emit('classroom_updated', {
        updatedAt: new Date().toISOString(),
        ...data,
      });
    })
    .catch((error) => {
      console.error('[ClassroomRealtime] Failed to build classroom payload:', error);
      io?.to(`classroom:${classroomId}`).emit('classroom_updated', {
        classroomId,
        updatedAt: new Date().toISOString(),
        ...payload,
      });
    });
}

export function emitClassroomAIMessage(classroomId: string, payload: Record<string, unknown>) {
  if (!io) return;

  io.to(`classroom:${classroomId}`).emit('classroom_ai_message', {
    classroomId,
    emittedAt: new Date().toISOString(),
    ...payload,
  });
}
