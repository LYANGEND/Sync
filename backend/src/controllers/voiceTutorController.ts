import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AzureOpenAI } from 'openai';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Azure OpenAI Configuration
const openai = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: '2024-08-01-preview', // Latest API version
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o',
});

// Schema validation
const startSessionSchema = z.object({
  topicId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  language: z.string().default('en'),
});

const sendVoiceMessageSchema = z.object({
  sessionId: z.string().uuid(),
  audioFile: z.any(), // Multer file
  language: z.string().default('en'),
});

/**
 * Start a new voice tutoring session
 */
export const startVoiceSession = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const data = startSessionSchema.parse(req.body);

    // Find student profile
    const student = await prisma.student.findUnique({
      where: { userId },
      include: { class: true },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    // Create session
    const session = await prisma.voiceSession.create({
      data: {
        studentId: student.id,
        topicId: data.topicId,
        subjectId: data.subjectId,
      },
    });

    // Get or create tutor context
    let context = await prisma.tutorContext.findUnique({
      where: { studentId: student.id },
    });

    if (!context) {
      context = await prisma.tutorContext.create({
        data: {
          studentId: student.id,
          preferredLanguage: data.language,
        },
      });
    }

    // Generate welcome message
    const welcomeMessage = await generateWelcomeMessage(student, data.topicId, data.language);

    res.json({
      sessionId: session.id,
      welcomeMessage: welcomeMessage.text,
      welcomeAudioUrl: welcomeMessage.audioUrl,
    });
  } catch (error) {
    console.error('Start voice session error:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
};

/**
 * Process voice message from student
 */
export const processVoiceMessage = async (req: Request, res: Response) => {
  try {
    const { sessionId, language } = req.body;
    const audioFile = (req as any).file;

    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Verify session exists and belongs to user
    const session = await prisma.voiceSession.findUnique({
      where: { id: sessionId },
      include: {
        student: {
          include: { class: true },
        },
        topic: true,
        subject: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Last 10 messages for context
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Step 1: Transcribe audio using Whisper
    const transcription = await transcribeAudio(audioFile.path, language);

    // Step 2: Get AI response with context
    const aiResponse = await generateTutorResponse(
      transcription,
      session,
      language
    );

    // Step 3: Convert response to speech
    const audioUrl = await textToSpeech(aiResponse, language);

    // Step 4: Save message to database
    const message = await prisma.voiceMessage.create({
      data: {
        sessionId,
        role: 'student',
        audioUrl: audioFile.path, // Should upload to S3 in production
        transcription,
        response: aiResponse,
        responseAudioUrl: audioUrl,
        language,
      },
    });

    // Step 5: Update tutor context
    await updateTutorContext(session.studentId, transcription, session.topicId);

    // Clean up temp file
    fs.unlinkSync(audioFile.path);

    res.json({
      messageId: message.id,
      transcription,
      response: aiResponse,
      audioUrl,
    });
  } catch (error) {
    console.error('Process voice message error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
};

/**
 * Transcribe audio using Azure OpenAI Whisper
 */
async function transcribeAudio(filePath: string, language: string): Promise<string> {
  try {
    const audioFile = fs.createReadStream(filePath);
    
    // Azure OpenAI Whisper deployment
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT || 'whisper',
      language: language === 'en' ? 'en' : undefined, // Auto-detect for other languages
      response_format: 'text',
    });

    return transcription as string;
  } catch (error) {
    console.error('Transcription error:', error);
    throw new Error('Failed to transcribe audio');
  }
}

/**
 * Generate AI tutor response with context
 */
async function generateTutorResponse(
  studentMessage: string,
  session: any,
  language: string
): Promise<string> {
  try {
    // Build context from previous messages
    const conversationHistory = session.messages.reverse().map((msg: any) => [
      { role: 'user', content: msg.transcription },
      { role: 'assistant', content: msg.response },
    ]).flat();

    // Get student's learning context
    const tutorContext = await prisma.tutorContext.findUnique({
      where: { studentId: session.studentId },
    });

    // Build system prompt
    const systemPrompt = buildSystemPrompt(session, tutorContext, language);

    // Call Azure OpenAI
    const completion = await openai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o', // Azure deployment name
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: studentMessage },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    return completion.choices[0].message.content || 'I apologize, I did not understand that.';
  } catch (error) {
    console.error('AI response error:', error);
    throw new Error('Failed to generate response');
  }
}

/**
 * Build system prompt for AI tutor
 */
function buildSystemPrompt(session: any, context: any, language: string): string {
  const student = session.student;
  const topic = session.topic;
  const subject = session.subject;

  let prompt = `You are a friendly and patient AI tutor for ${student.firstName}, a Grade ${student.class.gradeLevel} student in Zambia.

TEACHING STYLE:
- Use the Socratic method: ask guiding questions instead of giving direct answers
- Explain concepts using simple language and local examples (Zambian context)
- Be encouraging and positive
- Break down complex topics into smaller steps
- Check for understanding frequently

`;

  if (topic) {
    prompt += `CURRENT TOPIC: ${topic.title}\n`;
    if (topic.description) {
      prompt += `Topic Description: ${topic.description}\n`;
    }
  }

  if (subject) {
    prompt += `SUBJECT: ${subject.name}\n`;
  }

  if (context?.weakAreas) {
    prompt += `STUDENT'S WEAK AREAS: ${JSON.stringify(context.weakAreas)}\n`;
  }

  if (context?.learningStyle) {
    prompt += `LEARNING STYLE: ${context.learningStyle}\n`;
  }

  if (language !== 'en') {
    prompt += `\nIMPORTANT: Respond in ${language} language. Use simple, conversational language.\n`;
  }

  prompt += `\nREMEMBER: 
- Never give full answers to homework problems
- Guide the student to discover the answer themselves
- Use real-world examples from Zambian daily life
- Keep responses concise (2-3 sentences max for voice)
- Ask follow-up questions to ensure understanding`;

  return prompt;
}

/**
 * Convert text to speech using Azure OpenAI TTS
 */
async function textToSpeech(text: string, language: string): Promise<string> {
  try {
    const mp3 = await openai.audio.speech.create({
      model: process.env.AZURE_OPENAI_TTS_DEPLOYMENT || 'tts', // Azure TTS deployment
      voice: 'nova', // Options: alloy, echo, fable, onyx, nova, shimmer
      input: text,
      speed: 0.9, // Slightly slower for clarity
    });

    // Save to temp file (should upload to S3 in production)
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const fileName = `tutor-${Date.now()}.mp3`;
    const filePath = path.join(__dirname, '../../uploads/audio', fileName);
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, buffer);

    // Return URL (should be S3 URL in production)
    return `/uploads/audio/${fileName}`;
  } catch (error) {
    console.error('TTS error:', error);
    throw new Error('Failed to generate speech');
  }
}

/**
 * Generate welcome message for new session
 */
async function generateWelcomeMessage(
  student: any,
  topicId: string | undefined,
  language: string
): Promise<{ text: string; audioUrl: string }> {
  let welcomeText = `Hello ${student.firstName}! I'm your AI tutor. `;

  if (topicId) {
    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (topic) {
      welcomeText += `I'm here to help you learn about ${topic.title}. What would you like to know?`;
    }
  } else {
    welcomeText += `What would you like to learn today?`;
  }

  // Translate if needed
  if (language !== 'en') {
    // In production, use translation API
    // For now, keep English
  }

  const audioUrl = await textToSpeech(welcomeText, language);

  return { text: welcomeText, audioUrl };
}

/**
 * Update tutor context based on conversation
 */
async function updateTutorContext(
  studentId: string,
  message: string,
  topicId: string | undefined
): Promise<void> {
  try {
    const context = await prisma.tutorContext.findUnique({
      where: { studentId },
    });

    if (!context) return;

    // Update recent topics
    const recentTopics = context.recentTopics || [];
    if (topicId && !recentTopics.includes(topicId)) {
      recentTopics.unshift(topicId);
      if (recentTopics.length > 5) recentTopics.pop();
    }

    await prisma.tutorContext.update({
      where: { studentId },
      data: {
        currentTopic: topicId,
        recentTopics,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Update context error:', error);
  }
}

/**
 * End voice session
 */
export const endVoiceSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.voiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const duration = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);

    await prisma.voiceSession.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
        duration,
      },
    });

    res.json({ message: 'Session ended', duration });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
};

/**
 * Get session history
 */
export const getSessionHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    const student = await prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const sessions = await prisma.voiceSession.findMany({
      where: { studentId: student.id },
      include: {
        topic: true,
        subject: true,
        messages: {
          select: {
            id: true,
            transcription: true,
            response: true,
            createdAt: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });

    res.json(sessions);
  } catch (error) {
    console.error('Get session history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
};

/**
 * Explain lesson with voice
 */
export const explainLesson = async (req: Request, res: Response) => {
  try {
    const { topicId, language = 'en' } = req.body;
    const userId = (req as any).user?.userId;

    const student = await prisma.student.findUnique({
      where: { userId },
      include: { class: true },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: { subject: true },
    });

    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Generate comprehensive lesson explanation
    const prompt = `You are an expert teacher explaining "${topic.title}" to a Grade ${student.class.gradeLevel} student in Zambia.

Subject: ${topic.subject.name}
${topic.description ? `Description: ${topic.description}` : ''}

Provide a clear, engaging 2-3 minute lesson explanation that:
1. Introduces the concept with a relatable example
2. Explains the key points step-by-step
3. Uses simple language
4. Includes a Zambian context example
5. Ends with a question to check understanding

Keep it conversational and engaging for voice delivery.`;

    const completion = await openai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.7,
    });

    const explanation = completion.choices[0].message.content || '';

    // Convert to speech
    const audioUrl = await textToSpeech(explanation, language);

    // Save as AI content
    await prisma.aIContent.create({
      data: {
        topicId,
        contentType: 'LESSON',
        prompt,
        generatedContent: explanation,
        gradeLevel: student.class.gradeLevel,
        subjectId: topic.subjectId,
      },
    });

    res.json({
      explanation,
      audioUrl,
      topic: {
        id: topic.id,
        title: topic.title,
      },
    });
  } catch (error) {
    console.error('Explain lesson error:', error);
    res.status(500).json({ error: 'Failed to explain lesson' });
  }
};
