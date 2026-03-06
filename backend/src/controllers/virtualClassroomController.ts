import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/authMiddleware';
import { aiTutorService } from '../services/aiTutorService';
import { elevenLabsService, TEACHING_VOICES } from '../services/elevenLabsService';
import crypto from 'crypto';

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
    } = req.body;

    if (!title || !scheduledStart || !scheduledEnd) {
      return res.status(400).json({ error: 'Title, scheduledStart, and scheduledEnd are required' });
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
        aiTutorEnabled: aiTutorEnabled || false,
        aiTutorVoiceId: aiTutorVoiceId || null,
        aiTutorName: aiTutorName || 'AI Teacher',
        aiTutorPersona: aiTutorPersona || null,
        lessonPlanContent: lessonPlanContent || null,
        aiTutorLanguage: aiTutorLanguage || 'en',
        maxParticipants: maxParticipants || 50,
        isRecordingEnabled: isRecordingEnabled || false,
        createdById: userId,
      },
    });

    res.status(201).json(classroom);
  } catch (error: any) {
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

    // If upcoming, get only future scheduled classes
    if (upcoming === 'true') {
      where.scheduledStart = { gte: new Date() };
      where.status = { in: ['SCHEDULED', 'LIVE'] };
    }

    // Teachers only see their own classrooms unless admin
    if (role === 'TEACHER') {
      where.OR = [
        { createdById: userId },
        { teacherId: userId },
      ];
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

    res.json({ ...classroom, className, subjectName, teacherName });
  } catch (error: any) {
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

    // Don't allow updating certain fields
    delete updates.id;
    delete updates.roomName;
    delete updates.createdById;

    // Convert dates if present
    if (updates.scheduledStart) updates.scheduledStart = new Date(updates.scheduledStart);
    if (updates.scheduledEnd) updates.scheduledEnd = new Date(updates.scheduledEnd);

    const classroom = await prisma.virtualClassroom.update({
      where: { id },
      data: updates,
    });

    res.json(classroom);
  } catch (error: any) {
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

    await prisma.virtualClassroom.delete({ where: { id } });
    res.json({ message: 'Classroom deleted' });
  } catch (error: any) {
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

    const classroom = await prisma.virtualClassroom.update({
      where: { id },
      data: {
        status: 'LIVE',
        actualStart: new Date(),
      },
    });

    res.json(classroom);
  } catch (error: any) {
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

    // End any active tutor sessions
    await prisma.aITutorSession.updateMany({
      where: { classroomId: id, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });

    const classroom = await prisma.virtualClassroom.update({
      where: { id },
      data: {
        status: 'ENDED',
        actualEnd: new Date(),
      },
    });

    res.json(classroom);
  } catch (error: any) {
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

    const result = await aiTutorService.startSession(id);

    // Return response without audio buffer in JSON (audio served separately)
    res.json({
      sessionId: result.sessionId,
      greeting: {
        text: result.greeting.text,
        phase: result.greeting.phase,
        suggestedActions: result.greeting.suggestedActions,
        hasAudio: !!result.greeting.audioBuffer,
      },
    });
  } catch (error: any) {
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

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const result = await aiTutorService.endSession(sessionId);
    res.json(result);
  } catch (error: any) {
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
    });
  } catch (error: any) {
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
    });
  } catch (error: any) {
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
    });
  } catch (error: any) {
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
    });
  } catch (error: any) {
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

    if (action === 'join') {
      const participant = await prisma.classroomParticipant.create({
        data: {
          classroomId: id,
          displayName: displayName || 'Anonymous',
          userId: userId || null,
          studentId: studentId || null,
          role: role || 'STUDENT',
        },
      });
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
      return res.json({ message: 'Participant left recorded' });
    }

    res.status(400).json({ error: 'Invalid action. Use "join" or "leave"' });
  } catch (error: any) {
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

    const messages = await prisma.classroomChat.findMany({
      where: { classroomId: id },
      orderBy: { createdAt: 'asc' },
      take: parseInt(limit as string),
    });

    res.json(messages);
  } catch (error: any) {
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
    console.error('[VirtualClassroom] Transcript error:', error);
    res.status(500).json({ error: error.message });
  }
};
