import { prisma } from '../utils/prisma';
import aiService from './aiService';
import { elevenLabsService } from './elevenLabsService';
import { Prisma } from '@prisma/client';

// ==========================================
// AI TUTOR SERVICE — The Teaching Brain
// ==========================================
// Orchestrates the AI teacher's behavior:
// - Manages lesson flow (greeting → teaching → Q&A → wrap-up)
// - Processes student messages and generates contextual responses
// - Generates quizzes, explanations, and teaching content
// - Tracks conversation history and engagement

interface ConversationEntry {
  role: 'teacher' | 'student' | 'system';
  speaker: string;
  message: string;
  timestamp: string;
  audioGenerated?: boolean;
}

interface TutorResponse {
  text: string;
  audioBuffer?: Buffer | null;
  audioContentType?: string;
  phase: string;
  suggestedActions?: string[];
  charactersUsed: number;
  tokensUsed: number;
}

interface LessonPlan {
  subject: string;
  topic: string;
  objectives: string[];
  sections: LessonSection[];
  duration: number; // minutes
}

interface LessonSection {
  title: string;
  content: string;
  duration: number; // minutes
  activities?: string[];
}

// Lesson phases the AI tutor progresses through
const LESSON_PHASES = [
  'GREETING',
  'ATTENDANCE', 
  'RECAP',
  'TEACHING',
  'Q_AND_A',
  'ACTIVITY',
  'WRAP_UP',
] as const;

type LessonPhase = typeof LESSON_PHASES[number];

/**
 * Build the system prompt that defines the AI teacher's personality and behavior
 */
function buildTeacherSystemPrompt(
  tutorName: string,
  persona: string | null,
  lessonPlan: string | null,
  phase: LessonPhase,
  classInfo: { className?: string; subjectName?: string; studentNames?: string[] },
  conversationHistory: ConversationEntry[]
): string {
  const defaultPersona = `You are ${tutorName}, a warm, patient, and engaging teacher. 
You speak clearly, use simple language appropriate for the students' level, and make learning fun.
You use the Socratic method — asking questions to guide understanding rather than just lecturing.
You encourage every student by name, celebrate correct answers, and gently redirect wrong ones.
You are culturally aware and use local examples when possible.`;

  const currentPersona = persona || defaultPersona;

  let phaseInstructions = '';
  switch (phase) {
    case 'GREETING':
      phaseInstructions = `You are in the GREETING phase. Welcome the students warmly. 
Introduce yourself and the topic for today. Set the mood with enthusiasm.
Ask if everyone is ready to begin. Keep it brief (2-3 sentences).
After greeting, the phase will move to ATTENDANCE.`;
      break;
    case 'ATTENDANCE':
      phaseInstructions = `You are taking ATTENDANCE. Call out student names one by one.
Acknowledge each student who responds. Note who is absent.
Be warm and personal — "Good morning, Tendai! Glad to see you today."
After checking all students, move to RECAP.`;
      break;
    case 'RECAP':
      phaseInstructions = `You are doing a RECAP of previous lessons. 
Briefly summarize key points from the last class. Ask 1-2 quick recall questions.
"Last time, we learned about [topic]. Who can remind us what [key concept] means?"
Keep this to 2-3 minutes worth of content. Then transition to TEACHING.`;
      break;
    case 'TEACHING':
      phaseInstructions = `You are in the main TEACHING phase. This is the core of the lesson.
Follow the lesson plan below. Explain concepts step by step.
Use examples, analogies, and visual descriptions.
Pause after each key point and ask "Does everyone understand?" or check comprehension.
Break complex ideas into smaller pieces. Use numbered steps for processes.
Teach one concept at a time before moving to the next.`;
      break;
    case 'Q_AND_A':
      phaseInstructions = `You are in the Q&A phase. Invite questions from students.
"Does anyone have questions about what we've covered?"
Answer questions thoroughly but concisely. If a question goes beyond the lesson scope,
acknowledge it and promise to cover it later. Redirect off-topic questions politely.`;
      break;
    case 'ACTIVITY':
      phaseInstructions = `You are running a class ACTIVITY or exercise.
Give the students a problem or task to work on. Explain the instructions clearly.
Walk through the first step as an example. Give them time to think.
Ask students to share their answers. Discuss correct and incorrect approaches.`;
      break;
    case 'WRAP_UP':
      phaseInstructions = `You are WRAPPING UP the lesson. 
Summarize the 3-4 key points covered today.
"Today we learned: 1) [point], 2) [point], 3) [point]."
Give a brief preview of what's coming next class.
Assign any homework if applicable.
End with encouragement: "Great job today, everyone! See you next class."`;
      break;
  }

  let studentContext = '';
  if (classInfo.studentNames && classInfo.studentNames.length > 0) {
    studentContext = `\n\nSTUDENTS IN CLASS: ${classInfo.studentNames.join(', ')}
Use their names when calling on them or responding to them.`;
  }

  let lessonContext = '';
  if (lessonPlan) {
    lessonContext = `\n\nLESSON PLAN:\n${lessonPlan}`;
  }

  // Recent conversation for context
  const recentConvo = conversationHistory.slice(-20).map(entry => {
    const role = entry.role === 'teacher' ? 'Teacher' : entry.speaker;
    return `${role}: ${entry.message}`;
  }).join('\n');

  return `${currentPersona}

CLASS INFORMATION:
- Class: ${classInfo.className || 'Virtual Classroom'}
- Subject: ${classInfo.subjectName || 'General'}

CURRENT LESSON PHASE: ${phase}
${phaseInstructions}
${studentContext}
${lessonContext}

TEACHING RULES:
1. Keep responses conversational and natural — like a real teacher speaking to a class.
2. Use short paragraphs. One idea per response when possible.
3. NEVER say you are an AI. You are ${tutorName}, their teacher.
4. Address students by name when they speak or ask questions.
5. If a student seems confused, re-explain in a different way.
6. Keep each response to 2-4 sentences for natural conversation flow.
7. Use encouraging language: "Great question!", "Well done!", "Let's think about this together."
8. When asking a question, WAIT for the student to respond before continuing.
9. If multiple students respond, acknowledge each one.
10. Stay on topic but be flexible enough to address relevant tangents briefly.

RECENT CONVERSATION:
${recentConvo || '(Class is just starting)'}

Respond ONLY as ${tutorName}. Do not include any meta-text, role labels, or formatting markers.`;
}

class AITutorService {
  // In-memory session states (for active sessions)
  private activeSessions: Map<string, {
    conversationHistory: ConversationEntry[];
    phase: LessonPhase;
    topicIndex: number;
    startedAt: Date;
  }> = new Map();

  /**
   * Initialize or resume a tutor session for a classroom
   */
  async startSession(classroomId: string): Promise<{ sessionId: string; greeting: TutorResponse }> {
    const classroom = await prisma.virtualClassroom.findUnique({
      where: { id: classroomId },
    });

    if (!classroom) {
      throw new Error('Classroom not found');
    }

    if (!classroom.aiTutorEnabled) {
      throw new Error('AI Tutor is not enabled for this classroom');
    }

    // Get class and subject info if available
    let className = 'Virtual Classroom';
    let subjectName = 'General';
    let studentNames: string[] = [];

    if (classroom.classId) {
      const classInfo = await prisma.class.findUnique({
        where: { id: classroom.classId },
        include: {
          students: {
            where: { status: 'ACTIVE' },
            select: { firstName: true, lastName: true },
            take: 50,
          },
        },
      });
      if (classInfo) {
        className = classInfo.name;
        studentNames = classInfo.students.map((s: any) => `${s.firstName} ${s.lastName}`);
      }
    }

    if (classroom.subjectId) {
      const subject = await prisma.subject.findUnique({
        where: { id: classroom.subjectId },
      });
      if (subject) {
        subjectName = subject.name;
      }
    }

    // Create DB session
    const session = await prisma.aITutorSession.create({
      data: {
        classroomId,
        status: 'ACTIVE',
        voiceId: classroom.aiTutorVoiceId,
        lessonPhase: 'GREETING',
        startedAt: new Date(),
      },
    });

    // Initialize in-memory state
    this.activeSessions.set(session.id, {
      conversationHistory: [],
      phase: 'GREETING',
      topicIndex: 0,
      startedAt: new Date(),
    });

    // Generate greeting
    const systemPrompt = buildTeacherSystemPrompt(
      classroom.aiTutorName,
      classroom.aiTutorPersona,
      classroom.lessonPlanContent,
      'GREETING',
      { className, subjectName, studentNames },
      []
    );

    const greetingPrompt = `The class is about to start. Students are joining the virtual classroom. Greet them and introduce today's lesson on ${subjectName}. Be warm and enthusiastic.`;

    const aiResponse = await aiService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: greetingPrompt },
    ]);

    const greetingText = aiResponse.content;

    // Generate voice for the greeting
    let audioBuffer: Buffer | null = null;
    let audioContentType = '';
    try {
      const ttsResult = await elevenLabsService.teacherSpeak(
        greetingText,
        { voiceId: classroom.aiTutorVoiceId || undefined }
      );
      if (ttsResult) {
        audioBuffer = ttsResult.audioBuffer;
        audioContentType = ttsResult.contentType;
      }
    } catch (err) {
      console.warn('[AITutor] TTS failed for greeting, continuing with text only:', err);
    }

    // Save to conversation history
    const entry: ConversationEntry = {
      role: 'teacher',
      speaker: classroom.aiTutorName,
      message: greetingText,
      timestamp: new Date().toISOString(),
      audioGenerated: !!audioBuffer,
    };

    const memState = this.activeSessions.get(session.id)!;
    memState.conversationHistory.push(entry);

    // Save chat message to DB
    await prisma.classroomChat.create({
      data: {
        classroomId,
        senderName: classroom.aiTutorName,
        isAI: true,
        message: greetingText,
      },
    });

    // Update session metrics
    await prisma.aITutorSession.update({
      where: { id: session.id },
      data: {
        totalTokensUsed: { increment: aiResponse.tokensUsed || 0 },
        totalTTSCharacters: { increment: greetingText.length },
        conversationLog: [entry] as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      sessionId: session.id,
      greeting: {
        text: greetingText,
        audioBuffer,
        audioContentType,
        phase: 'GREETING',
        suggestedActions: ['Take Attendance', 'Start Teaching'],
        charactersUsed: greetingText.length,
        tokensUsed: aiResponse.tokensUsed || 0,
      },
    };
  }

  /**
   * Process a student's message and generate the AI teacher's response
   */
  async processStudentMessage(
    sessionId: string,
    studentName: string,
    message: string
  ): Promise<TutorResponse> {
    const session = await prisma.aITutorSession.findUnique({
      where: { id: sessionId },
      include: { classroom: true },
    });

    if (!session || session.status !== 'ACTIVE') {
      throw new Error('No active tutoring session');
    }

    const classroom = session.classroom;

    // Get or initialize memory state
    let memState = this.activeSessions.get(sessionId);
    if (!memState) {
      // Recover from restart — load from DB
      memState = {
        conversationHistory: (session.conversationLog as unknown as ConversationEntry[]) || [],
        phase: (session.lessonPhase as LessonPhase) || 'TEACHING',
        topicIndex: session.topicIndex || 0,
        startedAt: session.startedAt || new Date(),
      };
      this.activeSessions.set(sessionId, memState);
    }

    // Add student message to history
    const studentEntry: ConversationEntry = {
      role: 'student',
      speaker: studentName,
      message,
      timestamp: new Date().toISOString(),
    };
    memState.conversationHistory.push(studentEntry);

    // Get class context
    let className = 'Virtual Classroom';
    let subjectName = 'General';
    let studentNames: string[] = [];

    if (classroom.classId) {
      const classInfo = await prisma.class.findUnique({
        where: { id: classroom.classId },
        include: {
          students: {
            where: { status: 'ACTIVE' },
            select: { firstName: true, lastName: true },
            take: 50,
          },
        },
      });
      if (classInfo) {
        className = classInfo.name;
        studentNames = classInfo.students.map((s: any) => `${s.firstName} ${s.lastName}`);
      }
    }

    if (classroom.subjectId) {
      const subject = await prisma.subject.findUnique({ where: { id: classroom.subjectId } });
      if (subject) subjectName = subject.name;
    }

    // Build system prompt for current phase
    const systemPrompt = buildTeacherSystemPrompt(
      classroom.aiTutorName,
      classroom.aiTutorPersona,
      classroom.lessonPlanContent,
      memState.phase,
      { className, subjectName, studentNames },
      memState.conversationHistory
    );

    // Build message array for AI
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `${studentName} says: "${message}"` },
    ];

    const aiResponse = await aiService.chat(messages);
    const responseText = aiResponse.content;

    // Generate voice
    let audioBuffer: Buffer | null = null;
    let audioContentType = '';
    try {
      const ttsResult = await elevenLabsService.teacherSpeak(
        responseText,
        { voiceId: classroom.aiTutorVoiceId || undefined }
      );
      if (ttsResult) {
        audioBuffer = ttsResult.audioBuffer;
        audioContentType = ttsResult.contentType;
      }
    } catch (err) {
      console.warn('[AITutor] TTS failed, continuing with text:', err);
    }

    // Save teacher response to history
    const teacherEntry: ConversationEntry = {
      role: 'teacher',
      speaker: classroom.aiTutorName,
      message: responseText,
      timestamp: new Date().toISOString(),
      audioGenerated: !!audioBuffer,
    };
    memState.conversationHistory.push(teacherEntry);

    // Save to DB
    await prisma.classroomChat.createMany({
      data: [
        {
          classroomId: classroom.id,
          senderName: studentName,
          isAI: false,
          message,
        },
        {
          classroomId: classroom.id,
          senderName: classroom.aiTutorName,
          isAI: true,
          message: responseText,
        },
      ],
    });

    // Update session
    await prisma.aITutorSession.update({
      where: { id: sessionId },
      data: {
        totalTokensUsed: { increment: aiResponse.tokensUsed || 0 },
        totalTTSCharacters: { increment: responseText.length },
        questionsAsked: { increment: 1 },
        questionsAnswered: { increment: 1 },
        conversationLog: memState.conversationHistory as unknown as Prisma.InputJsonValue,
        lessonPhase: memState.phase,
      },
    });

    return {
      text: responseText,
      audioBuffer,
      audioContentType,
      phase: memState.phase,
      suggestedActions: this.getSuggestedActions(memState.phase),
      charactersUsed: responseText.length,
      tokensUsed: aiResponse.tokensUsed || 0,
    };
  }

  /**
   * Advance the lesson to the next phase
   */
  async advancePhase(sessionId: string): Promise<TutorResponse> {
    const session = await prisma.aITutorSession.findUnique({
      where: { id: sessionId },
      include: { classroom: true },
    });

    if (!session || session.status !== 'ACTIVE') {
      throw new Error('No active tutoring session');
    }

    let memState = this.activeSessions.get(sessionId);
    if (!memState) {
      memState = {
        conversationHistory: (session.conversationLog as unknown as ConversationEntry[]) || [],
        phase: (session.lessonPhase as LessonPhase) || 'GREETING',
        topicIndex: session.topicIndex || 0,
        startedAt: session.startedAt || new Date(),
      };
      this.activeSessions.set(sessionId, memState);
    }

    // Find next phase
    const currentIdx = LESSON_PHASES.indexOf(memState.phase);
    const nextIdx = Math.min(currentIdx + 1, LESSON_PHASES.length - 1);
    memState.phase = LESSON_PHASES[nextIdx] as LessonPhase;

    const classroom = session.classroom;

    // Generate transition message
    const systemPrompt = buildTeacherSystemPrompt(
      classroom.aiTutorName,
      classroom.aiTutorPersona,
      classroom.lessonPlanContent,
      memState.phase,
      {},
      memState.conversationHistory
    );

    const transitionPrompt = `Transition the class to the ${memState.phase.replace('_', ' ')} phase. 
Make a smooth, natural transition from what you were just doing.`;

    const aiResponse = await aiService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: transitionPrompt },
    ]);

    const responseText = aiResponse.content;

    // Generate voice
    let audioBuffer: Buffer | null = null;
    let audioContentType = '';
    try {
      const ttsResult = await elevenLabsService.teacherSpeak(
        responseText,
        { voiceId: classroom.aiTutorVoiceId || undefined }
      );
      if (ttsResult) {
        audioBuffer = ttsResult.audioBuffer;
        audioContentType = ttsResult.contentType;
      }
    } catch (err) {
      console.warn('[AITutor] TTS failed for phase transition:', err);
    }

    // Save to history
    const entry: ConversationEntry = {
      role: 'teacher',
      speaker: classroom.aiTutorName,
      message: responseText,
      timestamp: new Date().toISOString(),
      audioGenerated: !!audioBuffer,
    };
    memState.conversationHistory.push(entry);

    // Save to DB
    await prisma.classroomChat.create({
      data: {
        classroomId: classroom.id,
        senderName: classroom.aiTutorName,
        isAI: true,
        message: responseText,
      },
    });

    await prisma.aITutorSession.update({
      where: { id: sessionId },
      data: {
        lessonPhase: memState.phase,
        totalTokensUsed: { increment: aiResponse.tokensUsed || 0 },
        totalTTSCharacters: { increment: responseText.length },
        conversationLog: memState.conversationHistory as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      text: responseText,
      audioBuffer,
      audioContentType,
      phase: memState.phase,
      suggestedActions: this.getSuggestedActions(memState.phase),
      charactersUsed: responseText.length,
      tokensUsed: aiResponse.tokensUsed || 0,
    };
  }

  /**
   * Make the AI tutor say something specific (admin/teacher override)
   */
  async speak(sessionId: string, text: string): Promise<TutorResponse> {
    const session = await prisma.aITutorSession.findUnique({
      where: { id: sessionId },
      include: { classroom: true },
    });

    if (!session || session.status !== 'ACTIVE') {
      throw new Error('No active tutoring session');
    }

    const classroom = session.classroom;

    // Generate voice directly (no AI processing needed)
    let audioBuffer: Buffer | null = null;
    let audioContentType = '';
    try {
      const ttsResult = await elevenLabsService.teacherSpeak(
        text,
        { voiceId: classroom.aiTutorVoiceId || undefined }
      );
      if (ttsResult) {
        audioBuffer = ttsResult.audioBuffer;
        audioContentType = ttsResult.contentType;
      }
    } catch (err) {
      console.warn('[AITutor] TTS failed for speak:', err);
    }

    // Save to DB
    await prisma.classroomChat.create({
      data: {
        classroomId: classroom.id,
        senderName: classroom.aiTutorName,
        isAI: true,
        message: text,
      },
    });

    return {
      text,
      audioBuffer,
      audioContentType,
      phase: session.lessonPhase as string,
      charactersUsed: text.length,
      tokensUsed: 0,
    };
  }

  /**
   * Generate an instant quiz for the current topic
   */
  async generateQuiz(sessionId: string, topic?: string): Promise<TutorResponse> {
    const session = await prisma.aITutorSession.findUnique({
      where: { id: sessionId },
      include: { classroom: true },
    });

    if (!session || session.status !== 'ACTIVE') {
      throw new Error('No active tutoring session');
    }

    const classroom = session.classroom;
    const memState = this.activeSessions.get(sessionId);
    const currentTopic = topic || session.currentTopic || 'the lesson so far';

    const quizPrompt = `Generate a quick 3-question verbal quiz about ${currentTopic}.
Format it as a teacher would say it out loud in class:
"Alright class, let's do a quick check! Question 1: [question]. Raise your hand if you know!"
Make the questions progressively harder: easy, medium, challenging.
After stating each question, pause and say you'll wait for answers.`;

    const aiResponse = await aiService.chat([
      { role: 'system', content: `You are ${classroom.aiTutorName}, a teacher conducting a verbal quiz in class. Be encouraging and fun.` },
      { role: 'user', content: quizPrompt },
    ]);

    const quizText = aiResponse.content;

    // Generate voice
    let audioBuffer: Buffer | null = null;
    let audioContentType = '';
    try {
      const ttsResult = await elevenLabsService.teacherSpeak(
        quizText,
        { voiceId: classroom.aiTutorVoiceId || undefined }
      );
      if (ttsResult) {
        audioBuffer = ttsResult.audioBuffer;
        audioContentType = ttsResult.contentType;
      }
    } catch (err) {
      console.warn('[AITutor] TTS failed for quiz:', err);
    }

    // Save to conversation
    if (memState) {
      memState.conversationHistory.push({
        role: 'teacher',
        speaker: classroom.aiTutorName,
        message: quizText,
        timestamp: new Date().toISOString(),
        audioGenerated: !!audioBuffer,
      });
    }

    await prisma.classroomChat.create({
      data: {
        classroomId: classroom.id,
        senderName: classroom.aiTutorName,
        isAI: true,
        message: quizText,
      },
    });

    return {
      text: quizText,
      audioBuffer,
      audioContentType,
      phase: session.lessonPhase as string,
      suggestedActions: ['Reveal Answers', 'Continue Teaching'],
      charactersUsed: quizText.length,
      tokensUsed: aiResponse.tokensUsed || 0,
    };
  }

  /**
   * End the tutoring session and generate a summary
   */
  async endSession(sessionId: string): Promise<{ summary: string; metrics: any }> {
    const session = await prisma.aITutorSession.findUnique({
      where: { id: sessionId },
      include: { classroom: true },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    const classroom = session.classroom;
    const memState = this.activeSessions.get(sessionId);
    const conversationLog = memState?.conversationHistory ||
      (session.conversationLog as unknown as ConversationEntry[]) || [];

    // Generate class summary
    const summaryPrompt = `Based on the following class conversation, generate a brief summary:
- What topics were covered
- Key points discussed
- Questions asked by students
- Areas where students seemed to struggle
- Suggested follow-up topics

CONVERSATION:
${conversationLog.map(e => `${e.speaker}: ${e.message}`).join('\n')}`;

    const aiResponse = await aiService.chat([
      { role: 'system', content: 'You are an educational assistant summarizing a class session. Be concise and actionable.' },
      { role: 'user', content: summaryPrompt },
    ]);

    // Update session in DB
    await prisma.aITutorSession.update({
      where: { id: sessionId },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
        conversationLog: conversationLog as unknown as Prisma.InputJsonValue,
        lessonPhase: 'WRAP_UP',
      },
    });

    // Create a recording/summary entry
    await prisma.classRecording.create({
      data: {
        classroomId: classroom.id,
        summary: aiResponse.content,
        transcript: conversationLog.map(e => `[${e.timestamp}] ${e.speaker}: ${e.message}`).join('\n'),
        keyTopics: [], // Could extract from summary
      },
    });

    // Clean up in-memory state
    this.activeSessions.delete(sessionId);

    return {
      summary: aiResponse.content,
      metrics: {
        duration: session.startedAt
          ? Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000 / 60)
          : 0,
        totalTokensUsed: session.totalTokensUsed,
        totalTTSCharacters: session.totalTTSCharacters,
        questionsAsked: session.questionsAsked,
        questionsAnswered: session.questionsAnswered,
        totalMessages: conversationLog.length,
      },
    };
  }

  /**
   * Get the current state of a tutor session
   */
  async getSessionState(sessionId: string) {
    const session = await prisma.aITutorSession.findUnique({
      where: { id: sessionId },
      include: { classroom: true },
    });

    if (!session) return null;

    const memState = this.activeSessions.get(sessionId);

    return {
      sessionId: session.id,
      status: session.status,
      phase: memState?.phase || session.lessonPhase,
      tutorName: session.classroom.aiTutorName,
      startedAt: session.startedAt,
      metrics: {
        tokensUsed: session.totalTokensUsed,
        ttsCharacters: session.totalTTSCharacters,
        questionsAsked: session.questionsAsked,
        questionsAnswered: session.questionsAnswered,
        messageCount: memState?.conversationHistory.length || 0,
      },
      suggestedActions: this.getSuggestedActions(
        (memState?.phase || session.lessonPhase) as LessonPhase
      ),
    };
  }

  /**
   * Get suggested actions based on current lesson phase
   */
  private getSuggestedActions(phase: LessonPhase): string[] {
    switch (phase) {
      case 'GREETING':
        return ['Take Attendance', 'Skip to Teaching', 'Start Recap'];
      case 'ATTENDANCE':
        return ['Start Recap', 'Skip to Teaching'];
      case 'RECAP':
        return ['Start Teaching', 'Quick Quiz'];
      case 'TEACHING':
        return ['Ask Class a Question', 'Quick Quiz', 'Open Q&A', 'Activity Time'];
      case 'Q_AND_A':
        return ['Continue Teaching', 'Quick Quiz', 'Activity Time', 'Wrap Up'];
      case 'ACTIVITY':
        return ['Continue Teaching', 'Open Q&A', 'Wrap Up'];
      case 'WRAP_UP':
        return ['End Class', 'One More Question', 'Back to Teaching'];
      default:
        return ['Continue Teaching', 'Quick Quiz', 'Wrap Up'];
    }
  }
}

export const aiTutorService = new AITutorService();
export default aiTutorService;
