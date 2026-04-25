import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/authMiddleware';
import { aiTutorService } from '../services/aiTutorService';
import { elevenLabsService, TEACHING_VOICES } from '../services/elevenLabsService';
import { syncClassroomAttendance } from '../services/classroomAttendanceService';
import {
  buildRuntimeLessonPlan,
  buildRuntimeLessonPlanFromTopic,
  getLessonRuntimeSnapshot,
  renderRuntimeLessonPlan,
} from '../services/lessonPlanRuntimeService';
import { emitClassroomUpdated } from '../services/classroomRealtimeService';
import crypto from 'crypto';
import { AcademicScopeError, ensureAcademicClassAccess, ensureTopicMatchesClassGrade } from '../utils/academicScope';

// ==========================================
// HELPERS
// ==========================================

/**
 * Build a structured lesson plan string from topic + subtopics in the DB.
 * This is used both by createClassroom and the AI tutor system prompt.
 */
async function buildLessonPlanFromSyllabus(topicId: string, selectedSubTopicIds?: string[]): Promise<string> {
  const topic: any = await (prisma.topic as any).findUnique({
    where: { id: topicId },
    include: {
      subtopics: {
        where: selectedSubTopicIds?.length ? { id: { in: selectedSubTopicIds } } : undefined,
        orderBy: { orderIndex: 'asc' },
      },
      subject: { select: { name: true } },
    },
  });

  if (!topic) return '';

  let plan = `📚 SUBJECT: ${topic.subject.name}\n`;
  plan += `📖 TOPIC: ${topic.title}\n`;
  if (topic.description) plan += `📝 Description: ${topic.description}\n`;
  plan += `📊 Grade Level: ${topic.gradeLevel}\n\n`;

  if (topic.subtopics.length > 0) {
    plan += `--- SUBTOPICS TO COVER ---\n\n`;
    topic.subtopics.forEach((st: any, i: number) => {
      plan += `${i + 1}. ${st.title}\n`;
      if (st.description) plan += `   ${st.description}\n`;
      if (st.learningObjectives) {
        try {
          const objectives = JSON.parse(st.learningObjectives);
          if (Array.isArray(objectives) && objectives.length) {
            plan += `   Learning Objectives:\n`;
            objectives.forEach((obj: string) => {
              plan += `   • ${obj}\n`;
            });
          }
        } catch {}
      }
      if (st.duration) plan += `   ⏱ Duration: ~${st.duration} minutes\n`;
      plan += '\n';
    });
  }

  plan += `--- LESSON FLOW ---\n`;
  plan += `1. INTRODUCTION: Review previous knowledge, introduce today's topic\n`;
  plan += `2. TEACHING: Cover the subtopics above with examples and explanations\n`;
  plan += `3. ACTIVITY: Interactive exercise related to the subtopics\n`;
  plan += `4. ASSESSMENT: Check understanding with questions\n`;
  plan += `5. WRAP-UP: Summarize key points, preview next topic\n`;

  return plan;
}

async function buildClassroomLessonRuntime(classroom: any, subjectName?: string | null) {
  const runtimePlan = await buildRuntimeLessonPlan({
    title: classroom.title,
    subjectName,
    scheduledStart: classroom.scheduledStart,
    scheduledEnd: classroom.scheduledEnd,
    topicId: classroom.topicId,
    selectedSubTopicIds: classroom.selectedSubTopicIds,
    lessonPlanContent: classroom.lessonPlanContent,
  });

  const activeSession = classroom.tutorSessions?.find((session: any) => session.status === 'ACTIVE')
    || classroom.tutorSessions?.[0]
    || null;

  return getLessonRuntimeSnapshot(runtimePlan, {
    actualStart: classroom.actualStart,
    scheduledStart: classroom.scheduledStart,
    scheduledEnd: classroom.scheduledEnd,
  }, activeSession ? {
    lessonPhase: activeSession.lessonPhase,
    currentTopic: activeSession.currentTopic,
    topicIndex: activeSession.topicIndex,
  } : null);
}

async function ensureClassroomAccess(
  req: AuthRequest,
  classroomId: string,
  options?: { requireManage?: boolean }
) {
  const classroom = await prisma.virtualClassroom.findUnique({
    where: { id: classroomId },
    select: {
      id: true,
      classId: true,
      subjectId: true,
      teacherId: true,
      createdById: true,
    },
  });

  if (!classroom) {
    throw new AcademicScopeError(404, 'Classroom not found');
  }

  const user = req.user;
  if (!user) {
    throw new AcademicScopeError(401, 'Unauthorized');
  }

  if (user.role === 'SUPER_ADMIN') {
    return classroom;
  }

  if (classroom.classId) {
    await ensureAcademicClassAccess(req, classroom.classId, classroom.subjectId ? { subjectId: classroom.subjectId } : undefined);
  } else if (user.role === 'TEACHER') {
    const isOwner = classroom.teacherId === user.userId || classroom.createdById === user.userId;
    if (!isOwner) {
      throw new AcademicScopeError(403, 'You do not have access to this classroom');
    }
  } else {
    throw new AcademicScopeError(403, 'You do not have access to this classroom');
  }

  if (options?.requireManage && user.role !== 'SUPER_ADMIN' && user.role !== 'TEACHER') {
    throw new AcademicScopeError(403, 'You are not allowed to manage this classroom');
  }

  return classroom;
}

// ==========================================
// VIRTUAL CLASSROOM CONTROLLER
// ==========================================

/**
 * Create a new virtual classroom
 */
export const createClassroom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const {
      title,
      description,
      classId,
      subjectId,
      scheduledStart,
      scheduledEnd,
      aiTutorEnabled,
      aiTutorVoiceId,
      aiTutorName,
      aiTutorPersona,
      lessonPlanContent,
      aiTutorLanguage,
      maxParticipants,
      isRecordingEnabled,
      jitsiDomain,
      roomPassword,
      topicId,
      selectedSubTopicIds,
    } = req.body;

    if (!title || !scheduledStart || !scheduledEnd) {
      return res.status(400).json({ error: 'Title, scheduledStart, and scheduledEnd are required' });
    }

    if (classId) {
      await ensureAcademicClassAccess(req, classId, subjectId ? { subjectId } : undefined);
    }

    if (classId && topicId) {
      await ensureTopicMatchesClassGrade(topicId, classId);
    }

    // If topic is selected, build a consistent lesson plan from the runtime segments
    let finalLessonPlan = lessonPlanContent || null;
    if (topicId && !lessonPlanContent) {
      const runtimePlan = await buildRuntimeLessonPlanFromTopic({
        title,
        scheduledStart,
        scheduledEnd,
        topicId,
        selectedSubTopicIds,
      });
      finalLessonPlan = runtimePlan ? renderRuntimeLessonPlan(runtimePlan) : await buildLessonPlanFromSyllabus(topicId, selectedSubTopicIds);
    }

    // Generate a unique Jitsi room name
    const roomName = `sync-${crypto.randomBytes(4).toString('hex')}-${title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)}`;

    const classroom = await prisma.virtualClassroom.create({
      data: {
        title,
        description: description || null,
        classId: classId || null,
        subjectId: subjectId || null,
        teacherId: userId,
        roomName,
        roomPassword: roomPassword || null,
        jitsiDomain: jitsiDomain || 'meet.jit.si',
        scheduledStart: new Date(scheduledStart),
        scheduledEnd: new Date(scheduledEnd),
        topicId: topicId || null,
        selectedSubTopicIds: selectedSubTopicIds || null,
        aiTutorEnabled: aiTutorEnabled || false,
        aiTutorVoiceId: aiTutorVoiceId || null,
        aiTutorName: aiTutorName || 'AI Teacher',
        aiTutorPersona: aiTutorPersona || null,
        lessonPlanContent: finalLessonPlan,
        aiTutorLanguage: aiTutorLanguage || 'en',
        maxParticipants: maxParticipants || 50,
        isRecordingEnabled: isRecordingEnabled || false,
        createdById: userId,
      } as any,
    });

    res.status(201).json(classroom);
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[VirtualClassroom] Create error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get all virtual classrooms (with filters)
 */
export const getClassrooms = async (req: AuthRequest, res: Response) => {
  try {
    const { status, classId, upcoming } = req.query;
    const userId = req.user?.userId;
    const role = req.user?.role;

    const where: any = {};

    if (status) where.status = status;
    if (classId) where.classId = classId;

    if (classId && typeof classId === 'string') {
      await ensureAcademicClassAccess(req, classId);
    }

    // If upcoming, get only future scheduled classes
    if (upcoming === 'true') {
      where.scheduledStart = { gte: new Date() };
      where.status = { in: ['SCHEDULED', 'LIVE'] };
    }

    // Teachers only see their own classrooms unless admin
    if (role === 'TEACHER') {
      const myClasses = await prisma.class.findMany({
        where: { teacherId: userId },
        select: { id: true },
      });
      const myTeacherSubjects = await prisma.teacherSubject.findMany({
        where: { teacherId: userId },
        select: { classId: true },
      });
      const accessibleClassIds = [...new Set([
        ...myClasses.map((item) => item.id),
        ...myTeacherSubjects.map((item) => item.classId),
      ])];

      where.OR = [
        { createdById: userId },
        { teacherId: userId },
        ...(accessibleClassIds.length > 0 ? [{ classId: { in: accessibleClassIds } }] : []),
      ];
    } else if (role === 'STUDENT') {
      const student = await prisma.student.findFirst({ where: { userId }, select: { classId: true } });
      where.classId = student?.classId || '__NO_CLASS__';
    } else if (role === 'PARENT') {
      const childClasses = await prisma.student.findMany({ where: { parentId: userId }, select: { classId: true } });
      where.classId = { in: [...new Set(childClasses.map((item) => item.classId))] };
    }

    const classrooms = await prisma.virtualClassroom.findMany({
      where,
      orderBy: { scheduledStart: 'asc' },
      include: {
        _count: {
          select: {
            participants: true,
            chatMessages: true,
            tutorSessions: true,
          },
        },
      },
    });

    // Enrich with class and subject names
    const enriched = await Promise.all(
      classrooms.map(async (c) => {
        let className = null;
        let subjectName = null;
        let teacherName = null;

        if (c.classId) {
          const cls = await prisma.class.findUnique({
            where: { id: c.classId },
            select: { name: true },
          });
          className = cls?.name;
        }
        if (c.subjectId) {
          const subj = await prisma.subject.findUnique({
            where: { id: c.subjectId },
            select: { name: true },
          });
          subjectName = subj?.name;
        }
        if (c.teacherId) {
          const teacher = await prisma.user.findUnique({
            where: { id: c.teacherId },
            select: { fullName: true },
          });
          teacherName = teacher?.fullName;
        }

        return {
          ...c,
          className,
          subjectName,
          teacherName,
        };
      })
    );

    res.json(enriched);
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[VirtualClassroom] List error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get a single virtual classroom by ID
 */
export const getClassroom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await ensureClassroomAccess(req, id);

    const classroom = await prisma.virtualClassroom.findUnique({
      where: { id },
      include: {
        participants: {
          orderBy: { joinedAt: 'desc' },
        },
        chatMessages: {
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
        tutorSessions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        recordings: {
          orderBy: { createdAt: 'desc' },
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
      return res.status(404).json({ error: 'Classroom not found' });
    }

    // Enrich
    let className = null;
    let subjectName = null;
    let teacherName = null;

    if (classroom.classId) {
      const cls = await prisma.class.findUnique({
        where: { id: classroom.classId },
        select: { name: true },
      });
      className = cls?.name;
    }
    if (classroom.subjectId) {
      const subj = await prisma.subject.findUnique({
        where: { id: classroom.subjectId },
        select: { name: true },
      });
      subjectName = subj?.name;
    }
    if (classroom.teacherId) {
      const teacher = await prisma.user.findUnique({
        where: { id: classroom.teacherId },
        select: { fullName: true },
      });
      teacherName = teacher?.fullName;
    }

    const lessonRuntime = await buildClassroomLessonRuntime(classroom, subjectName);

    res.json({ ...classroom, className, subjectName, teacherName, lessonRuntime });
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[VirtualClassroom] Get error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update a virtual classroom
 */
export const updateClassroom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const existingClassroom = await ensureClassroomAccess(req, id, { requireManage: true });

    // Don't allow updating certain fields
    delete updates.id;
    delete updates.roomName;
    delete updates.createdById;

    // Convert dates if present
    if (updates.scheduledStart) updates.scheduledStart = new Date(updates.scheduledStart);
    if (updates.scheduledEnd) updates.scheduledEnd = new Date(updates.scheduledEnd);

    const targetClassId = updates.classId ?? existingClassroom.classId;
    const targetSubjectId = updates.subjectId ?? existingClassroom.subjectId;

    if (targetClassId) {
      await ensureAcademicClassAccess(req, targetClassId, targetSubjectId ? { subjectId: targetSubjectId } : undefined);
    }

    if (targetClassId && (updates.topicId || req.body.topicId)) {
      await ensureTopicMatchesClassGrade(updates.topicId || req.body.topicId, targetClassId);
    }

    const classroom = await prisma.virtualClassroom.update({
      where: { id },
      data: updates,
    });

    res.json(classroom);
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[VirtualClassroom] Update error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Delete a virtual classroom
 */
export const deleteClassroom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await ensureClassroomAccess(req, id, { requireManage: true });

    await prisma.virtualClassroom.delete({ where: { id } });
    res.json({ message: 'Classroom deleted' });
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[VirtualClassroom] Delete error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Start a classroom (go LIVE)
 */
export const startClassroom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await ensureClassroomAccess(req, id, { requireManage: true });

    const classroom = await prisma.virtualClassroom.update({
      where: { id },
      data: {
        status: 'LIVE',
        actualStart: new Date(),
      },
    });

    if (classroom.aiTutorEnabled) {
      const activeSession = await prisma.aITutorSession.findFirst({
        where: {
          classroomId: id,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      if (!activeSession) {
        const existingSessionCount = await prisma.aITutorSession.count({
          where: { classroomId: id },
        });

        if (existingSessionCount === 0) {
          try {
            await aiTutorService.startSession(id, { generateAudio: true });
          } catch (sessionError) {
            console.error('[VirtualClassroom] Auto-start AI Tutor error:', sessionError);
          }
        }
      }
    }

    emitClassroomUpdated(id, { reason: 'class_started' });
    res.json(classroom);
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[VirtualClassroom] Start error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * End a classroom
 */
export const endClassroom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await ensureClassroomAccess(req, id, { requireManage: true });

    const activeSessions = await prisma.aITutorSession.findMany({
      where: { classroomId: id, status: 'ACTIVE' },
      select: { id: true },
    });

    for (const session of activeSessions) {
      await aiTutorService.endSession(session.id);
    }

    const classroom = await prisma.virtualClassroom.update({
      where: { id },
      data: {
        status: 'ENDED',
        actualEnd: new Date(),
      },
    });

    const attendanceSync = await syncClassroomAttendance(id);

    emitClassroomUpdated(id, { reason: 'class_ended' });
    res.json({
      ...classroom,
      attendanceSync,
    });
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[VirtualClassroom] End error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================================
// AI TUTOR ENDPOINTS
// ==========================================

/**
 * Start AI Tutor for a classroom
 */
export const startAITutor = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { mode } = req.body; // 'LEAD_TEACHER' or 'CO_TEACHER'

    await ensureClassroomAccess(req, id, { requireManage: true });

    const result = await aiTutorService.startSession(id, { mode: mode || 'CO_TEACHER' });

    let audioBase64: string | null = null;
    if (result.greeting.audioBuffer) {
      audioBase64 = result.greeting.audioBuffer.toString('base64');
    }

    res.json({
      sessionId: result.sessionId,
      mode: mode || 'CO_TEACHER',
      greeting: {
        text: result.greeting.text,
        audio: audioBase64,
        audioContentType: result.greeting.audioContentType,
        phase: result.greeting.phase,
        suggestedActions: result.greeting.suggestedActions,
        hasAudio: !!result.greeting.audioBuffer,
        voiceOnly: result.greeting.channel === 'VOICE_ONLY',
      },
    });
    emitClassroomUpdated(id, { reason: 'ai_tutor_started' });
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[AITutor] Start error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Stop AI Tutor for a classroom
 */
export const stopAITutor = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { sessionId } = req.body;

    await ensureClassroomAccess(req, id, { requireManage: true });

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const result = await aiTutorService.endSession(sessionId);
    emitClassroomUpdated(id, { reason: 'ai_tutor_stopped' });
    res.json(result);
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[AITutor] Stop error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Send a message to the AI Tutor (student asks a question)
 */
export const chatWithAITutor = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { sessionId, studentName, message } = req.body;

    await ensureClassroomAccess(req, id);

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    const userName = studentName || req.user?.userId || 'Student';

    const result = await aiTutorService.processStudentMessage(sessionId, userName, message);

    // Convert audio buffer to base64 for JSON transport
    let audioBase64: string | null = null;
    if (result.audioBuffer) {
      audioBase64 = result.audioBuffer.toString('base64');
    }

    res.json({
      text: result.text,
      audio: audioBase64,
      audioContentType: result.audioContentType,
      phase: result.phase,
      suggestedActions: result.suggestedActions,
      tokensUsed: result.tokensUsed,
      charactersUsed: result.charactersUsed,
      voiceOnly: result.channel === 'VOICE_ONLY',
    });
    emitClassroomUpdated(id, { reason: 'ai_tutor_chat' });
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[AITutor] Chat error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Advance the lesson to the next phase
 */
export const advanceTutorPhase = async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.body;

    await ensureClassroomAccess(req, req.params.id, { requireManage: true });

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const result = await aiTutorService.advancePhase(sessionId);

    let audioBase64: string | null = null;
    if (result.audioBuffer) {
      audioBase64 = result.audioBuffer.toString('base64');
    }

    res.json({
      text: result.text,
      audio: audioBase64,
      audioContentType: result.audioContentType,
      phase: result.phase,
      suggestedActions: result.suggestedActions,
      voiceOnly: result.channel === 'VOICE_ONLY',
    });
    emitClassroomUpdated(req.params.id, { reason: 'ai_tutor_phase_advanced' });
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[AITutor] Advance phase error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Make the AI Tutor say something specific
 */
export const tutorSpeak = async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId, text } = req.body;

    await ensureClassroomAccess(req, req.params.id, { requireManage: true });

    if (!sessionId || !text) {
      return res.status(400).json({ error: 'sessionId and text are required' });
    }

    const result = await aiTutorService.speak(sessionId, text);

    let audioBase64: string | null = null;
    if (result.audioBuffer) {
      audioBase64 = result.audioBuffer.toString('base64');
    }

    res.json({
      text: result.text,
      audio: audioBase64,
      audioContentType: result.audioContentType,
      phase: result.phase,
      voiceOnly: result.channel === 'VOICE_ONLY',
    });
    emitClassroomUpdated(req.params.id, { reason: 'ai_tutor_speak' });
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[AITutor] Speak error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Generate a quick quiz in the current session
 */
export const tutorQuiz = async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId, topic } = req.body;

    await ensureClassroomAccess(req, req.params.id, { requireManage: true });

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const result = await aiTutorService.generateQuiz(sessionId, topic);

    let audioBase64: string | null = null;
    if (result.audioBuffer) {
      audioBase64 = result.audioBuffer.toString('base64');
    }

    res.json({
      text: result.text,
      audio: audioBase64,
      audioContentType: result.audioContentType,
      phase: result.phase,
      suggestedActions: result.suggestedActions,
      voiceOnly: result.channel === 'VOICE_ONLY',
    });
    emitClassroomUpdated(req.params.id, { reason: 'ai_tutor_quiz' });
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[AITutor] Quiz error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get AI Tutor session status
 */
export const getTutorStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await ensureClassroomAccess(req, id);

    // Get the active session for this classroom
    const session = await prisma.aITutorSession.findFirst({
      where: {
        classroomId: id,
        status: 'ACTIVE',
      },
    });

    if (!session) {
      return res.json({ active: false });
    }

    const state = await aiTutorService.getSessionState(session.id);
    res.json({ active: true, ...state });
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[AITutor] Status error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Record participant join/leave
 */
export const recordParticipant = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { action, displayName, userId, studentId, role } = req.body;
    await ensureClassroomAccess(req, id);
    const resolvedRole = role
      || (req.user?.role === 'STUDENT'
        ? 'STUDENT'
        : req.user?.role === 'TEACHER' || req.user?.role === 'SUPER_ADMIN'
          ? 'TEACHER'
          : 'OBSERVER');

    if (action === 'join') {
      const participant = await prisma.classroomParticipant.create({
        data: {
          classroomId: id,
          displayName: displayName || 'Anonymous',
          userId: userId || null,
          studentId: studentId || null,
          role: resolvedRole,
        },
      });
      emitClassroomUpdated(id, { reason: 'participant_joined' });
      return res.json(participant);
    }

    if (action === 'leave') {
      // Update the most recent participant entry that hasn't left
      const participant = await prisma.classroomParticipant.findFirst({
        where: {
          classroomId: id,
          displayName,
          leftAt: null,
        },
        orderBy: { joinedAt: 'desc' },
      });

      if (participant) {
        await prisma.classroomParticipant.update({
          where: { id: participant.id },
          data: { leftAt: new Date() },
        });
      }
      emitClassroomUpdated(id, { reason: 'participant_left' });
      return res.json({ message: 'Participant left recorded' });
    }

    res.status(400).json({ error: 'Invalid action. Use "join" or "leave"' });
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[VirtualClassroom] Participant error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get chat history for a classroom
 */
export const getChatHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = '100' } = req.query;

    await ensureClassroomAccess(req, id);

    const messages = await prisma.classroomChat.findMany({
      where: { classroomId: id },
      orderBy: { createdAt: 'asc' },
      take: parseInt(limit as string),
    });

    res.json(messages);
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[VirtualClassroom] Chat history error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get available ElevenLabs voices
 */
export const getAvailableVoices = async (req: AuthRequest, res: Response) => {
  try {
    const isConfigured = await elevenLabsService.isConfigured();

    if (!isConfigured) {
      // Return built-in voice suggestions
      return res.json({
        configured: false,
        voices: Object.entries(TEACHING_VOICES).map(([name, id]) => ({
          voice_id: id,
          name: name.charAt(0) + name.slice(1).toLowerCase(),
          category: 'premade',
        })),
      });
    }

    const voices = await elevenLabsService.getVoices();
    res.json({
      configured: true,
      voices: voices.map(v => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category,
        labels: v.labels,
        preview_url: v.preview_url,
      })),
    });
  } catch (error: any) {
    console.error('[VirtualClassroom] Voices error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get session transcript / recording
 */
export const getSessionTranscript = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { sessionId } = req.query;

    await ensureClassroomAccess(req, id);

    let session;
    if (sessionId) {
      session = await prisma.aITutorSession.findUnique({
        where: { id: sessionId as string },
      });
    } else {
      session = await prisma.aITutorSession.findFirst({
        where: { classroomId: id },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!session) {
      return res.json({ transcript: [], metrics: null });
    }

    res.json({
      transcript: session.conversationLog || [],
      metrics: {
        tokensUsed: session.totalTokensUsed,
        ttsCharacters: session.totalTTSCharacters,
        questionsAsked: session.questionsAsked,
        questionsAnswered: session.questionsAnswered,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        phase: session.lessonPhase,
      },
    });
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[VirtualClassroom] Transcript error:', error);
    res.status(500).json({ error: error.message });
  }
};
