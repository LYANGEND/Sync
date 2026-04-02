import { prisma } from '../utils/prisma';
import aiService from './aiService';
import { elevenLabsService } from './elevenLabsService';
import { Prisma } from '@prisma/client';
import { buildRuntimeLessonPlan } from './lessonPlanRuntimeService';
import { emitClassroomAIMessage } from './classroomRealtimeService';

// ==========================================
// AI TUTOR SERVICE — The Teaching Brain
// ==========================================
// Orchestrates the AI teacher's behavior:
// - Manages lesson flow (greeting → teaching → Q&A → wrap-up)
// - Processes student messages and generates contextual responses
// - Generates quizzes, explanations, and teaching content
// - Tracks conversation history and engagement

// Teaching modes
export type TutorMode = 'LEAD_TEACHER' | 'CO_TEACHER';

// How the tutor delivers a response
// VOICE_ONLY  — spoken aloud, NOT shown as a chat bubble (default for teaching)
// CHAT_ONLY   — typed reply in chat, no TTS (for @mention / typed Q&A)
// VOICE_AND_CHAT — both (fallback / explicit)
export type ResponseChannel = 'VOICE_ONLY' | 'CHAT_ONLY' | 'VOICE_AND_CHAT';

interface ConversationEntry {
  role: 'teacher' | 'student' | 'system';
  speaker: string;
  message: string;
  timestamp: string;
  audioGenerated?: boolean;
  channel?: ResponseChannel;
}

interface TutorResponse {
  text: string;
  audioBuffer?: Buffer | null;
  audioContentType?: string;
  phase: string;
  suggestedActions?: string[];
  charactersUsed: number;
  tokensUsed: number;
  channel?: ResponseChannel;
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

interface SessionStartOptions {
  generateAudio?: boolean;
  mode?: TutorMode;
}

interface PhaseTransitionOptions {
  generateAudio?: boolean;
  prompt?: string;
  currentTopic?: string;
  topicIndex?: number;
  segmentObjectives?: string[];
  segmentTalkingPoints?: string[];
  segmentIndex?: number;
  totalSegments?: number;
}

interface PromptSegmentContext {
  title: string | null;
  objectives: string[];
  talkingPoints: string[];
  segmentIndex?: number;
  totalSegments?: number;
}

// Lesson phases the AI tutor progresses through
export const LESSON_PHASES = [
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
  conversationHistory: ConversationEntry[],
  segmentContext?: PromptSegmentContext | null
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
If the lesson plan shows this is part of a syllabus sequence, reference what was covered before.
Keep this to 2-3 minutes worth of content. Then transition to TEACHING.`;
      break;
    case 'TEACHING':
      phaseInstructions = `You are in the main TEACHING phase. This is the core of the lesson.
Follow the lesson plan below carefully — cover each subtopic and its learning objectives.
Explain concepts step by step using examples, analogies, and visual descriptions.
Pause after each key point and ask "Does everyone understand?" or check comprehension.
Break complex ideas into smaller pieces. Use numbered steps for processes.
Teach one subtopic fully before moving to the next.
Use local/Zambian examples wherever possible to make content relatable.`;
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

  let activeSegmentContext = '';
  if (segmentContext?.title) {
    const parts = [
      `CURRENT SEGMENT: ${segmentContext.title}`,
      segmentContext.segmentIndex && segmentContext.totalSegments
        ? `Segment ${segmentContext.segmentIndex} of ${segmentContext.totalSegments}`
        : null,
      segmentContext.objectives.length > 0
        ? `Objectives: ${segmentContext.objectives.join('; ')}`
        : null,
      segmentContext.talkingPoints.length > 0
        ? `Talking points: ${segmentContext.talkingPoints.join('; ')}`
        : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      activeSegmentContext = `\n\n${parts.join('\n')}`;
    }
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
${activeSegmentContext}

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
11. Your voice responses are SPOKEN ALOUD to the class — write as you would speak, not as you would type.
12. When a student asks a question in chat, answer naturally as if they raised their hand in class.
13. Do NOT narrate your actions or add stage directions. Just speak naturally.

RECENT CONVERSATION:
${recentConvo || '(Class is just starting)'}

Respond ONLY as ${tutorName}. Do not include any meta-text, role labels, or formatting markers.`;
}

async function resolveSegmentContext(
  classroom: {
    title: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    topicId: string | null;
    selectedSubTopicIds: unknown;
    lessonPlanContent: string | null;
  },
  options: {
    topicIndex?: number | null;
    currentTopic?: string | null;
    segmentObjectives?: string[];
    segmentTalkingPoints?: string[];
    segmentIndex?: number;
    totalSegments?: number;
  } = {}
): Promise<PromptSegmentContext | null> {
  if (
    options.currentTopic
    && (
      (options.segmentObjectives && options.segmentObjectives.length > 0)
      || (options.segmentTalkingPoints && options.segmentTalkingPoints.length > 0)
      || options.segmentIndex !== undefined
      || options.totalSegments !== undefined
    )
  ) {
    return {
      title: options.currentTopic,
      objectives: options.segmentObjectives || [],
      talkingPoints: options.segmentTalkingPoints || [],
      segmentIndex: options.segmentIndex,
      totalSegments: options.totalSegments,
    };
  }

  const runtimePlan = await buildRuntimeLessonPlan({
    title: classroom.title,
    scheduledStart: classroom.scheduledStart,
    scheduledEnd: classroom.scheduledEnd,
    topicId: classroom.topicId,
    selectedSubTopicIds: classroom.selectedSubTopicIds,
    lessonPlanContent: classroom.lessonPlanContent,
  });

  const byIndex = typeof options.topicIndex === 'number'
    ? runtimePlan.segments[options.topicIndex]
    : undefined;
  const segment = byIndex
    || runtimePlan.segments.find(item => item.title === options.currentTopic)
    || runtimePlan.segments[0];

  if (!segment) {
    return null;
  }

  return {
    title: segment.title,
    objectives: segment.objectives,
    talkingPoints: segment.talkingPoints,
    segmentIndex: segment.index + 1,
    totalSegments: runtimePlan.segments.length,
  };
}

// ================================================================
// TEACHER TTS — Azure TTS primary, ElevenLabs fallback
// ================================================================
// Uses Azure OpenAI TTS first (fast, cost-effective, already
// configured for Master AI voice). Falls back to ElevenLabs if
// Azure fails (quota, misconfigured, etc).
// Returns null if both fail — the tutor continues with text only.

async function generateTeacherAudio(
  text: string,
  voiceId?: string | null
): Promise<{ audioBuffer: Buffer; contentType: string } | null> {
  // Primary: Azure OpenAI TTS
  try {
    const buffer = await aiService.generateSpeech(text);
    if (buffer && buffer.length > 0) {
      return { audioBuffer: buffer, contentType: 'audio/mpeg' };
    }
  } catch (err) {
    console.warn('[AITutor] Azure TTS failed, trying ElevenLabs fallback:', (err as Error).message);
  }

  // Fallback: ElevenLabs (if configured)
  try {
    const result = await elevenLabsService.teacherSpeak(text, {
      voiceId: voiceId || undefined,
    });
    if (result) {
      return { audioBuffer: result.audioBuffer, contentType: result.contentType };
    }
  } catch (err) {
    console.warn('[AITutor] ElevenLabs fallback also failed:', (err as Error).message);
  }

  return null;
}

class AITutorService {
  // In-memory session states (for active sessions)
  private activeSessions: Map<string, {
    conversationHistory: ConversationEntry[];
    phase: LessonPhase;
    topicIndex: number;
    currentTopic: string | null;
    segmentContext: PromptSegmentContext | null;
    startedAt: Date;
    mode: TutorMode;
    autoAdvanceTimer?: ReturnType<typeof setTimeout> | null;
    classroomId: string;
  }> = new Map();

  private encodeAudioBuffer(audioBuffer?: Buffer | null) {
    return audioBuffer ? audioBuffer.toString('base64') : null;
  }

  private emitTeacherMessage(
    classroomId: string,
    chatMessage: {
      id: string;
      senderName: string;
      message: string;
      createdAt: Date;
    },
    options: {
      audioBuffer?: Buffer | null;
      audioContentType?: string;
      phase?: string | null;
      currentTopic?: string | null;
      messageType: 'greeting' | 'reply' | 'transition' | 'speak' | 'quiz';
      channel?: ResponseChannel;
    }
  ) {
    emitClassroomAIMessage(classroomId, {
      id: chatMessage.id,
      senderName: chatMessage.senderName,
      isAI: true,
      message: chatMessage.message,
      createdAt: chatMessage.createdAt.toISOString(),
      audio: this.encodeAudioBuffer(options.audioBuffer),
      audioContentType: options.audioContentType || null,
      phase: options.phase || null,
      currentTopic: options.currentTopic || null,
      messageType: options.messageType,
      voiceOnly: options.channel === 'VOICE_ONLY',
    });
  }

  /**
   * Initialize or resume a tutor session for a classroom
   */
  async startSession(
    classroomId: string,
    options: SessionStartOptions = {}
  ): Promise<{ sessionId: string; greeting: TutorResponse }> {
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

    // Auto-load saved lesson plans for this class+subject if no manual content set
    if (!classroom.lessonPlanContent && classroom.classId && classroom.subjectId) {
      const savedPlans = await prisma.lessonPlan.findMany({
        where: { classId: classroom.classId, subjectId: classroom.subjectId },
        orderBy: { weekStartDate: 'desc' },
        take: 3,
        include: { subject: { select: { name: true } } },
      });
      if (savedPlans.length > 0) {
        let planContext = `📋 SAVED LESSON PLANS FOR ${subjectName.toUpperCase()}:\n\n`;
        savedPlans.forEach((plan: any, i: number) => {
          planContext += `--- Plan ${i + 1}: ${plan.title} ---\n`;
          planContext += `Date: ${new Date(plan.weekStartDate).toLocaleDateString()}\n`;
          planContext += `${plan.content}\n\n`;
        });
        // Inject into classroom's lessonPlanContent for this session
        (classroom as any).lessonPlanContent = planContext;
      }
    }

    const initialSegmentContext = await resolveSegmentContext(classroom, {
      topicIndex: 0,
    });

    // Create DB session
    const session = await prisma.aITutorSession.create({
      data: {
        classroomId,
        status: 'ACTIVE',
        voiceId: classroom.aiTutorVoiceId,
        lessonPhase: 'GREETING',
        currentTopic: initialSegmentContext?.title || null,
        topicIndex: initialSegmentContext?.segmentIndex ? initialSegmentContext.segmentIndex - 1 : 0,
        startedAt: new Date(),
      },
    });

    const tutorMode: TutorMode = options.mode || 'CO_TEACHER';

    // Initialize in-memory state
    this.activeSessions.set(session.id, {
      conversationHistory: [],
      phase: 'GREETING',
      topicIndex: initialSegmentContext?.segmentIndex ? initialSegmentContext.segmentIndex - 1 : 0,
      currentTopic: initialSegmentContext?.title || null,
      segmentContext: initialSegmentContext,
      startedAt: new Date(),
      mode: tutorMode,
      autoAdvanceTimer: null,
      classroomId,
    });

    // Generate greeting
    const systemPrompt = buildTeacherSystemPrompt(
      classroom.aiTutorName,
      classroom.aiTutorPersona,
      classroom.lessonPlanContent,
      'GREETING',
      { className, subjectName, studentNames },
      [],
      initialSegmentContext
    );

    const greetingPrompt = `The class is about to start. Students are joining the virtual classroom. Greet them and introduce today's lesson on ${subjectName}. Be warm and enthusiastic.`;

    const aiResponse = await aiService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: greetingPrompt },
    ]);

    const greetingText = aiResponse.content;
    const shouldGenerateAudio = options.generateAudio !== false;

    // Generate voice (Azure TTS primary, ElevenLabs fallback)
    let audioBuffer: Buffer | null = null;
    let audioContentType = '';
    if (shouldGenerateAudio) {
      const ttsResult = await generateTeacherAudio(greetingText, classroom.aiTutorVoiceId);
      audioBuffer = ttsResult?.audioBuffer || null;
      audioContentType = ttsResult?.contentType || '';
    }

    // Save to conversation history
    const entry: ConversationEntry = {
      role: 'teacher',
      speaker: classroom.aiTutorName,
      message: greetingText,
      timestamp: new Date().toISOString(),
      audioGenerated: !!audioBuffer,
      channel: 'VOICE_ONLY',
    };

    const memState = this.activeSessions.get(session.id)!;
    memState.conversationHistory.push(entry);

    // Save chat message to DB
    const greetingChat = await prisma.classroomChat.create({
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

    this.emitTeacherMessage(classroomId, greetingChat, {
      audioBuffer,
      audioContentType,
      phase: 'GREETING',
      currentTopic: initialSegmentContext?.title || null,
      messageType: 'greeting',
      channel: 'VOICE_ONLY',
    });

    // In LEAD_TEACHER mode, auto-advance through lesson phases
    if (tutorMode === 'LEAD_TEACHER') {
      this.scheduleAutoAdvance(session.id, 'GREETING', 20_000); // 20s greeting then move on
    }

    return {
      sessionId: session.id,
      greeting: {
        text: greetingText,
        audioBuffer,
        audioContentType,
        phase: 'GREETING',
        suggestedActions: tutorMode === 'LEAD_TEACHER' ? [] : ['Take Attendance', 'Start Teaching'],
        charactersUsed: greetingText.length,
        tokensUsed: aiResponse.tokensUsed || 0,
        channel: 'VOICE_ONLY' as ResponseChannel,
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
        currentTopic: session.currentTopic || null,
        segmentContext: null,
        startedAt: session.startedAt || new Date(),
        mode: 'CO_TEACHER',
        autoAdvanceTimer: null,
        classroomId: session.classroomId,
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

    // Auto-load saved lesson plans if classroom doesn't have manual content
    if (!classroom.lessonPlanContent && classroom.classId && classroom.subjectId) {
      const savedPlans = await prisma.lessonPlan.findMany({
        where: { classId: classroom.classId, subjectId: classroom.subjectId },
        orderBy: { weekStartDate: 'desc' },
        take: 3,
        include: { subject: { select: { name: true } } },
      });
      if (savedPlans.length > 0) {
        let planContext = `📋 SAVED LESSON PLANS FOR ${subjectName.toUpperCase()}:\n\n`;
        savedPlans.forEach((plan: any, i: number) => {
          planContext += `--- Plan ${i + 1}: ${plan.title} ---\n`;
          planContext += `Date: ${new Date(plan.weekStartDate).toLocaleDateString()}\n`;
          planContext += `${plan.content}\n\n`;
        });
        (classroom as any).lessonPlanContent = planContext;
      }
    }

    memState.segmentContext = await resolveSegmentContext(classroom, {
      topicIndex: memState.topicIndex,
      currentTopic: memState.currentTopic,
    });
    if (memState.segmentContext?.title) {
      memState.currentTopic = memState.segmentContext.title;
    }

    // Build system prompt for current phase
    const systemPrompt = buildTeacherSystemPrompt(
      classroom.aiTutorName,
      classroom.aiTutorPersona,
      classroom.lessonPlanContent,
      memState.phase,
      { className, subjectName, studentNames },
      memState.conversationHistory,
      memState.segmentContext
    );

    // Build message array for AI
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `${studentName} says: "${message}"` },
    ];

    const aiResponse = await aiService.chat(messages);
    const responseText = aiResponse.content;

    // Determine response channel:
    // Student TYPED a message → the tutor replies in CHAT (text visible)
    // The tutor also speaks the reply aloud for the classroom
    // This mirrors how a human teacher answers a raised hand — they
    // speak to the whole class but the question came via chat.
    const channel: ResponseChannel = 'VOICE_AND_CHAT';

    // Generate voice (Azure TTS primary, ElevenLabs fallback)
    const ttsResult = await generateTeacherAudio(responseText, classroom.aiTutorVoiceId);
    const audioBuffer = ttsResult?.audioBuffer || null;
    const audioContentType = ttsResult?.contentType || '';

    // Save teacher response to history
    const teacherEntry: ConversationEntry = {
      role: 'teacher',
      speaker: classroom.aiTutorName,
      message: responseText,
      timestamp: new Date().toISOString(),
      audioGenerated: !!audioBuffer,
      channel,
    };
    memState.conversationHistory.push(teacherEntry);

    // Save to DB
    await prisma.classroomChat.create({
      data: {
        classroomId: classroom.id,
        senderName: studentName,
        isAI: false,
        message,
      },
    });
    const teacherChat = await prisma.classroomChat.create({
      data: {
        classroomId: classroom.id,
        senderName: classroom.aiTutorName,
        isAI: true,
        message: responseText,
      },
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
        currentTopic: memState.currentTopic,
        topicIndex: memState.topicIndex,
      },
    });

    this.emitTeacherMessage(classroom.id, teacherChat, {
      audioBuffer,
      audioContentType,
      phase: memState.phase,
      currentTopic: memState.currentTopic,
      messageType: 'reply',
      channel,
    });

    return {
      text: responseText,
      audioBuffer,
      audioContentType,
      phase: memState.phase,
      suggestedActions: this.getSuggestedActions(memState.phase),
      charactersUsed: responseText.length,
      tokensUsed: aiResponse.tokensUsed || 0,
      channel,
    };
  }

  /**
   * Advance the lesson to the next phase
   */
  async advancePhase(sessionId: string): Promise<TutorResponse> {
    const session = await prisma.aITutorSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.status !== 'ACTIVE') {
      throw new Error('No active tutoring session');
    }

    const currentPhase = ((session.lessonPhase as LessonPhase) || 'GREETING');
    const currentIdx = LESSON_PHASES.indexOf(currentPhase);
    const nextIdx = Math.min(currentIdx + 1, LESSON_PHASES.length - 1);
    const nextPhase = LESSON_PHASES[nextIdx] as LessonPhase;

    return this.transitionToPhase(sessionId, nextPhase);
  }

  /**
   * Transition the lesson to a specific phase.
   * Used both for manual controls and automation.
   */
  async transitionToPhase(
    sessionId: string,
    targetPhase: LessonPhase,
    options: PhaseTransitionOptions = {}
  ): Promise<TutorResponse> {
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
        currentTopic: session.currentTopic || null,
        segmentContext: null,
        startedAt: session.startedAt || new Date(),
        mode: 'CO_TEACHER',
        autoAdvanceTimer: null,
        classroomId: session.classroomId,
      };
      this.activeSessions.set(sessionId, memState);
    }

    memState.phase = targetPhase;
    if (typeof options.topicIndex === 'number') {
      memState.topicIndex = options.topicIndex;
    }
    if (options.currentTopic !== undefined) {
      memState.currentTopic = options.currentTopic;
    }

    const classroom = session.classroom;
    memState.segmentContext = await resolveSegmentContext(classroom, {
      topicIndex: memState.topicIndex,
      currentTopic: memState.currentTopic,
      segmentObjectives: options.segmentObjectives,
      segmentTalkingPoints: options.segmentTalkingPoints,
      segmentIndex: options.segmentIndex,
      totalSegments: options.totalSegments,
    });
    if (memState.segmentContext?.title) {
      memState.currentTopic = memState.segmentContext.title;
    }

    // Generate transition message
    const systemPrompt = buildTeacherSystemPrompt(
      classroom.aiTutorName,
      classroom.aiTutorPersona,
      classroom.lessonPlanContent,
      memState.phase,
      {},
      memState.conversationHistory,
      memState.segmentContext
    );

    const transitionPrompt = options.prompt || `Transition the class to the ${memState.phase.replace('_', ' ')} phase. 
Make a smooth, natural transition from what you were just doing.
${memState.segmentContext?.title ? `Anchor the transition around "${memState.segmentContext.title}".` : ''}`;

    const aiResponse = await aiService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: transitionPrompt },
    ]);

    const responseText = aiResponse.content;
    const shouldGenerateAudio = options.generateAudio !== false;

    // Generate voice (Azure TTS primary, ElevenLabs fallback)
    let audioBuffer: Buffer | null = null;
    let audioContentType = '';
    if (shouldGenerateAudio) {
      const ttsResult = await generateTeacherAudio(responseText, classroom.aiTutorVoiceId);
      audioBuffer = ttsResult?.audioBuffer || null;
      audioContentType = ttsResult?.contentType || '';
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
    const transitionChat = await prisma.classroomChat.create({
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
        currentTopic: memState.currentTopic,
        topicIndex: memState.topicIndex,
        totalTokensUsed: { increment: aiResponse.tokensUsed || 0 },
        totalTTSCharacters: { increment: responseText.length },
        conversationLog: memState.conversationHistory as unknown as Prisma.InputJsonValue,
      },
    });

    this.emitTeacherMessage(classroom.id, transitionChat, {
      audioBuffer,
      audioContentType,
      phase: memState.phase,
      currentTopic: memState.currentTopic,
      messageType: 'transition',
      channel: 'VOICE_ONLY',
    });

    // In LEAD_TEACHER mode, schedule the next auto-advance
    if (memState.mode === 'LEAD_TEACHER' && memState.phase !== 'WRAP_UP') {
      const durationMs = this.getPhaseAutoAdvanceDuration(memState.phase, memState.segmentContext);
      this.scheduleAutoAdvance(sessionId, memState.phase, durationMs);
    }

    return {
      text: responseText,
      audioBuffer,
      audioContentType,
      phase: memState.phase,
      suggestedActions: memState.mode === 'LEAD_TEACHER' ? [] : this.getSuggestedActions(memState.phase),
      charactersUsed: responseText.length,
      tokensUsed: aiResponse.tokensUsed || 0,
      channel: 'VOICE_ONLY' as ResponseChannel,
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

    // Generate voice (Azure TTS primary, ElevenLabs fallback)
    const ttsResult = await generateTeacherAudio(text, classroom.aiTutorVoiceId);
    const audioBuffer = ttsResult?.audioBuffer || null;
    const audioContentType = ttsResult?.contentType || '';

    // Save to DB
    const spokenChat = await prisma.classroomChat.create({
      data: {
        classroomId: classroom.id,
        senderName: classroom.aiTutorName,
        isAI: true,
        message: text,
      },
    });

    await prisma.aITutorSession.update({
      where: { id: sessionId },
      data: {
        totalTTSCharacters: { increment: text.length },
      },
    });

    this.emitTeacherMessage(classroom.id, spokenChat, {
      audioBuffer,
      audioContentType,
      phase: session.lessonPhase as string,
      currentTopic: session.currentTopic || null,
      messageType: 'speak',
      channel: 'VOICE_ONLY',
    });

    return {
      text,
      audioBuffer,
      audioContentType,
      phase: session.lessonPhase as string,
      charactersUsed: text.length,
      tokensUsed: 0,
      channel: 'VOICE_ONLY' as ResponseChannel,
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

    // Generate voice (Azure TTS primary, ElevenLabs fallback)
    const ttsResult = await generateTeacherAudio(quizText, classroom.aiTutorVoiceId);
    const audioBuffer = ttsResult?.audioBuffer || null;
    const audioContentType = ttsResult?.contentType || '';

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

    const quizChat = await prisma.classroomChat.create({
      data: {
        classroomId: classroom.id,
        senderName: classroom.aiTutorName,
        isAI: true,
        message: quizText,
      },
    });

    await prisma.aITutorSession.update({
      where: { id: sessionId },
      data: {
        totalTokensUsed: { increment: aiResponse.tokensUsed || 0 },
        totalTTSCharacters: { increment: quizText.length },
        conversationLog: (memState?.conversationHistory || session.conversationLog || []) as unknown as Prisma.InputJsonValue,
      },
    });

    this.emitTeacherMessage(classroom.id, quizChat, {
      audioBuffer,
      audioContentType,
      phase: session.lessonPhase as string,
      currentTopic,
      messageType: 'quiz',
      channel: 'VOICE_ONLY',
    });

    return {
      text: quizText,
      audioBuffer,
      audioContentType,
      phase: session.lessonPhase as string,
      suggestedActions: ['Reveal Answers', 'Continue Teaching'],
      charactersUsed: quizText.length,
      tokensUsed: aiResponse.tokensUsed || 0,
      channel: 'VOICE_ONLY' as ResponseChannel,
    };
  }

  /**
   * End the tutoring session and generate a rich AI-powered summary
   */
  async endSession(sessionId: string): Promise<{ summary: string; structuredSummary: any; metrics: any }> {
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

    const conversationText = conversationLog
      .map(e => `${e.speaker}: ${e.message}`)
      .join('\n');

    const durationMinutes = session.startedAt
      ? Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000 / 60)
      : 0;

    // Generate a rich structured AI session summary
    const summaryPrompt = `You are an expert educational coach. Analyse this virtual classroom session and produce a comprehensive structured report.

SESSION DURATION: ${durationMinutes} minutes
CONVERSATION TRANSCRIPT:
${conversationText || '(No conversation recorded)'}

Return a JSON object with these exact keys:
{
  "briefSummary": "2-3 sentence overview of what happened",
  "topicsCovered": ["list", "of", "main topics"],
  "keyLearningPoints": ["key", "takeaways", "from the lesson"],
  "studentQuestionsAsked": ["each question students asked verbatim or paraphrased"],
  "areasOfConfusion": ["topics where students seemed confused or struggled"],
  "teacherHighlights": ["moments where the teacher explained things particularly well"],
  "homeworkOrFollowUp": "Any homework, follow-up tasks or next-class preview mentioned",
  "recommendedNextTopics": ["suggested topics for next lesson based on coverage gaps"],
  "engagementScore": "1-10 score with one-line justification",
  "classroomNarrativeSummary": "A 4-6 sentence teacher-facing narrative of how the class went — suitable to include in a lesson plan record"
}`;

    let structuredSummary: any = {};
    let plainSummary = '';

    try {
      structuredSummary = await aiService.generateJSON<any>(summaryPrompt, {
        systemPrompt: 'You are an educational coach. Always respond with valid JSON only.',
        temperature: 0.5,
      });
      plainSummary = structuredSummary.classroomNarrativeSummary || structuredSummary.briefSummary || '';
    } catch (err) {
      console.warn('[AITutor] Structured summary failed, falling back to plain summary:', err);
      // Fall back to plain text summary
      const fallbackResponse = await aiService.chat([
        { role: 'system', content: 'You are an educational assistant summarizing a class session. Be concise and actionable.' },
        { role: 'user', content: `Summarise this class session:\n${conversationText}` },
      ]);
      plainSummary = fallbackResponse.content;
      structuredSummary = { briefSummary: plainSummary };
    }

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
        summary: plainSummary,
        transcript: conversationLog.map(e => `[${e.timestamp}] ${e.speaker}: ${e.message}`).join('\n'),
        keyTopics: (structuredSummary.topicsCovered || []) as string[],
      },
    });

    // Auto-create a LessonPlan record from the session so the teacher has a record
    if (classroom.classId && classroom.subjectId && classroom.teacherId) {
      try {
        const lessonContent = [
          `## Virtual Classroom Session — Auto-generated Summary`,
          `**Duration:** ${durationMinutes} minutes`,
          `**Session date:** ${new Date().toLocaleDateString()}`,
          '',
          `### Topics Covered`,
          (structuredSummary.topicsCovered || []).map((t: string) => `- ${t}`).join('\n'),
          '',
          `### Key Learning Points`,
          (structuredSummary.keyLearningPoints || []).map((p: string) => `- ${p}`).join('\n'),
          '',
          `### Student Questions`,
          (structuredSummary.studentQuestionsAsked || []).map((q: string) => `- ${q}`).join('\n'),
          '',
          `### Areas of Confusion / Follow-up Needed`,
          (structuredSummary.areasOfConfusion || []).map((a: string) => `- ${a}`).join('\n'),
          '',
          `### Homework / Next Class`,
          structuredSummary.homeworkOrFollowUp || 'None specified',
          '',
          `### Recommended Next Topics`,
          (structuredSummary.recommendedNextTopics || []).map((t: string) => `- ${t}`).join('\n'),
          '',
          `---`,
          `*Auto-generated from AI Tutor session ${sessionId}*`,
        ].join('\n');

        // Find active term
        const activeTerm = await prisma.academicTerm.findFirst({
          where: { isActive: true },
        });

        await prisma.lessonPlan.create({
          data: {
            teacherId: classroom.teacherId,
            classId: classroom.classId,
            subjectId: classroom.subjectId,
            termId: activeTerm?.id || '',
            title: `[Virtual Class] ${classroom.title} — ${new Date().toLocaleDateString()}`,
            weekStartDate: new Date(),
            content: lessonContent,
            status: 'COMPLETED',
          } as any,
        });
      } catch (planErr) {
        console.warn('[AITutor] Could not auto-create lesson plan:', planErr);
      }
    }

    // Clean up auto-advance timer and in-memory state
    const activeState = this.activeSessions.get(sessionId);
    if (activeState?.autoAdvanceTimer) {
      clearTimeout(activeState.autoAdvanceTimer);
    }
    this.activeSessions.delete(sessionId);

    return {
      summary: plainSummary,
      structuredSummary,
      metrics: {
        duration: durationMinutes,
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
      currentTopic: memState?.currentTopic || session.currentTopic,
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

  // ================================================================
  // AUTO-ADVANCE ENGINE (LEAD_TEACHER mode)
  // ================================================================
  // When the tutor is the lead teacher, it drives the lesson
  // autonomously through each phase on a timer — just like a
  // human teacher would pace the class.

  /**
   * Schedule the next automatic phase advance.
   * Clears any existing timer first.
   */
  private scheduleAutoAdvance(sessionId: string, currentPhase: LessonPhase, delayMs: number) {
    const state = this.activeSessions.get(sessionId);
    if (!state) return;

    // Clear existing timer
    if (state.autoAdvanceTimer) {
      clearTimeout(state.autoAdvanceTimer);
      state.autoAdvanceTimer = null;
    }

    state.autoAdvanceTimer = setTimeout(async () => {
      try {
        const s = this.activeSessions.get(sessionId);
        if (!s || s.phase !== currentPhase) return; // phase changed manually, skip

        // Auto-advance to next phase
        await this.advancePhase(sessionId);
        console.log(`[AITutor] Auto-advanced ${sessionId} from ${currentPhase} → ${s.phase}`);
      } catch (err) {
        console.warn('[AITutor] Auto-advance failed:', (err as Error).message);
      }
    }, delayMs);
  }

  /**
   * How long the tutor should spend in each phase before auto-advancing.
   * Uses lesson segment durations if available, otherwise sensible defaults.
   */
  private getPhaseAutoAdvanceDuration(
    phase: LessonPhase,
    segmentContext: PromptSegmentContext | null
  ): number {
    // Segment-based duration takes priority (runtime lesson plan)
    // Phase defaults mirror real classroom timing
    switch (phase) {
      case 'GREETING':     return 20_000;          // 20 seconds
      case 'ATTENDANCE':   return 30_000;          // 30 seconds
      case 'RECAP':        return 2 * 60_000;      // 2 minutes
      case 'TEACHING':     return 8 * 60_000;      // 8 minutes (main block)
      case 'Q_AND_A':      return 3 * 60_000;      // 3 minutes
      case 'ACTIVITY':     return 5 * 60_000;      // 5 minutes
      case 'WRAP_UP':      return 2 * 60_000;      // 2 minutes
      default:             return 3 * 60_000;      // 3 minutes fallback
    }
  }

  /**
   * Get the mode for a session
   */
  getSessionMode(sessionId: string): TutorMode {
    const state = this.activeSessions.get(sessionId);
    return state?.mode || 'CO_TEACHER';
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
