import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, getUserId, getUserRole } from '../utils/tenantContext';
import { AzureOpenAI } from 'openai';
import OpenAI from 'openai';
import {
  lessonPlanSystemPrompt,
  quizSystemPrompt,
  emailSystemPrompt,
  chatSystemPrompt,
  generateLessonPlanPrompt,
  generateQuizPrompt,
  generateEmailPrompt,
  generateDemoLessonPlan,
  generateDemoQuiz,
  generateDemoEmail,
} from '../services/aiAssistantService';
import {
  generateLessonPlanPDF,
  generateLessonPlanWord,
  generateQuizPDF,
  generateQuizWord,
  generateEmailPDF,
} from '../services/documentExportService';

const prisma = new PrismaClient() as any;

// Initialize OpenAI client
const isAzureConfigured = process.env.AZURE_OPENAI_API_KEY &&
  process.env.AZURE_OPENAI_API_KEY !== 'your-azure-api-key' &&
  process.env.AZURE_OPENAI_ENDPOINT &&
  process.env.AZURE_OPENAI_ENDPOINT !== 'https://your-resource.openai.azure.com';

const isOpenAIConfigured = process.env.OPENAI_API_KEY &&
  process.env.OPENAI_API_KEY !== 'your-openai-api-key';

let openai: AzureOpenAI | OpenAI | null = null;
let DEPLOYMENT_NAME = 'gpt-4o-mini';

if (isAzureConfigured) {
  openai = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
  });
  DEPLOYMENT_NAME = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';
  console.log('Teacher AI Assistant: Using Azure OpenAI with deployment:', DEPLOYMENT_NAME);
} else if (isOpenAIConfigured) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  DEPLOYMENT_NAME = 'gpt-4o-mini';
  console.log('Teacher AI Assistant: Using OpenAI');
} else {
  console.log('Teacher AI Assistant: No API configured - running in demo mode');
}

// Rate limits
const DAILY_MESSAGE_LIMIT = 100; // Per teacher per day
const DAILY_TOKEN_LIMIT = 100000; // Per tenant per day

// Validation schemas
const chatMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

const lessonPlanSchema = z.object({
  subject: z.string().min(1),
  topic: z.string().min(1),
  gradeLevel: z.number().int().min(1).max(12),
  duration: z.number().int().min(15).max(180),
  learningObjectives: z.array(z.string()).optional(),
  specialRequirements: z.string().optional(),
  teachingStyle: z.enum(['lecture', 'hands-on', 'group-work', 'mixed']).optional(),
  curriculumStandards: z.array(z.string()).optional(),
  priorKnowledge: z.string().optional(),
  assessmentType: z.enum(['formative', 'summative', 'both']).optional(),
  technologyIntegration: z.boolean().optional(),
  crossCurricularLinks: z.array(z.string()).optional(),
});

const quizSchema = z.object({
  subject: z.string().min(1),
  topic: z.string().min(1),
  gradeLevel: z.number().int().min(1).max(12),
  questionCount: z.number().int().min(1).max(50),
  questionTypes: z.array(z.enum(['multiple-choice', 'true-false', 'short-answer'])),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']),
  includeAnswerKey: z.boolean().default(true),
});

const emailSchema = z.object({
  purpose: z.enum(['field-trip', 'grades', 'behavior', 'event', 'general']),
  recipient: z.enum(['parent', 'parents-group', 'admin', 'colleague']),
  tone: z.enum(['formal', 'friendly', 'urgent', 'informative']),
  keyPoints: z.array(z.string()),
  customDetails: z.string().optional(),
});

const templateSchema = z.object({
  type: z.enum(['lesson-plan', 'quiz', 'email']),
  name: z.string().min(1).max(100),
  content: z.any(),
  isPublic: z.boolean().default(false),
});

// Check rate limits
async function checkRateLimits(tenantId: string, userId: string): Promise<{ allowed: boolean; error?: string }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const usage = await prisma.teacherAIUsage.aggregate({
    where: {
      teacherId: userId,
      tenantId,
      date: { gte: today },
    },
    _sum: { tokensUsed: true },
    _count: true,
  });

  const messageCount = usage._count || 0;
  const tokenCount = usage._sum?.tokensUsed || 0;

  if (messageCount >= DAILY_MESSAGE_LIMIT) {
    return { allowed: false, error: 'Daily message limit reached. Please try again tomorrow.' };
  }

  if (tokenCount >= DAILY_TOKEN_LIMIT) {
    return { allowed: false, error: 'Daily token limit reached. Please try again tomorrow.' };
  }

  return { allowed: true };
}

// Track usage
async function trackUsage(tenantId: string, userId: string, feature: string, tokens: number) {
  await prisma.teacherAIUsage.create({
    data: {
      teacher: { connect: { id: userId } },
      tenant: { connect: { id: tenantId } },
      feature,
      tokensUsed: tokens,
    },
  });
}

// Get teacher context for personalization
async function getTeacherContext(tenantId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: {
      fullName: true,
      classesManaged: { select: { name: true, gradeLevel: true } },
    },
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  return {
    teacherName: user?.fullName || 'Teacher',
    schoolName: tenant?.name || 'School',
    classes: user?.classesManaged || [],
  };
}

// ==================== CHAT ====================

export async function chat(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);

    if (role !== 'TEACHER' && role !== 'BURSAR' && role !== 'SECRETARY' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only teachers can use this feature' });
    }

    const validatedData = chatMessageSchema.parse(req.body);
    const { conversationId, message } = validatedData;

    // Check rate limits
    const rateCheck = await checkRateLimits(tenantId, userId);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.error });
    }

    // Verify user exists
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!user) {
      console.error('Teacher AI: User not found', { userId, tenantId });
      return res.status(404).json({ error: 'User not found in database' });
    }

    // Get teacher context
    const context = await getTeacherContext(tenantId, userId);

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.teacherAIConversation.findFirst({
        where: { id: conversationId, teacherId: userId, tenantId },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
      });
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else {
      conversation = await prisma.teacherAIConversation.create({
        data: {
          teacher: { connect: { id: userId } },
          tenant: { connect: { id: tenantId } },
          title: message.slice(0, 50),
          type: 'CHAT',
        },
        include: { messages: true },
      });
    }

    // Save user message
    await prisma.teacherAIMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    });

    // Generate AI response
    let aiResponse: string;
    let tokensUsed = 0;

    if (openai) {
      const messages = [
        { role: 'system' as const, content: chatSystemPrompt },
        ...conversation.messages.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content: message },
      ];

      const completion = await openai.chat.completions.create({
        model: DEPLOYMENT_NAME,
        messages,
        max_completion_tokens: 2000,
      });

      aiResponse = completion.choices[0]?.message?.content || 'I apologize, I encountered an issue. Please try again.';
      tokensUsed = completion.usage?.total_tokens || 0;
    } else {
      // Demo mode response
      aiResponse = `Hello ${context.teacherName}! I'm your AI Teaching Assistant running in demo mode.

I can help you with:
- 📚 **Lesson Planning** - Create engaging lesson plans
- ✍️ **Quiz Creation** - Generate assessments
- 💬 **Email Drafting** - Write professional communications
- 💡 **Teaching Tips** - Get classroom strategies

To fully utilize my capabilities, please configure the Azure OpenAI or OpenAI API keys.

How can I help you today?`;
      tokensUsed = 100; // Estimate for demo
    }

    // Save AI response
    const aiMessage = await prisma.teacherAIMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: aiResponse,
        promptTokens: tokensUsed * 0.3,
        completionTokens: tokensUsed * 0.7,
      },
    });

    // Track usage
    await trackUsage(tenantId, userId, 'chat', tokensUsed);

    res.json({
      conversationId: conversation.id,
      message: {
        id: aiMessage.id,
        role: 'assistant',
        content: aiResponse,
        createdAt: aiMessage.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Teacher AI Chat error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to process chat message' });
  }
}

// ==================== LESSON PLAN GENERATOR ====================

export async function generateLessonPlan(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);

    if (role !== 'TEACHER' && role !== 'BURSAR' && role !== 'SECRETARY' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only teachers can use this feature' });
    }

    const validatedData = lessonPlanSchema.parse(req.body);

    // Verify user exists
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!user) {
      console.error('Lesson Plan: User not found', { userId, tenantId });
      return res.status(404).json({ error: 'User not found in database' });
    }

    // Check rate limits
    const rateCheck = await checkRateLimits(tenantId, userId);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.error });
    }

    const context = await getTeacherContext(tenantId, userId);
    const prompt = generateLessonPlanPrompt(validatedData);

    let lessonPlanContent: string;
    let tokensUsed = 0;

    if (openai) {
      const completion = await openai.chat.completions.create({
        model: DEPLOYMENT_NAME,
        messages: [
          { role: 'system', content: lessonPlanSystemPrompt },
          { role: 'user', content: prompt },
        ],
        max_completion_tokens: 3000,
      });

      lessonPlanContent = completion.choices[0]?.message?.content || 'Failed to generate lesson plan.';
      tokensUsed = completion.usage?.total_tokens || 0;
    } else {
      // Demo mode
      lessonPlanContent = generateDemoLessonPlan(validatedData);
      tokensUsed = 200;
    }

    // Create conversation record
    const conversation = await prisma.teacherAIConversation.create({
      data: {
        teacher: { connect: { id: userId } },
        tenant: { connect: { id: tenantId } },
        title: `Lesson Plan: ${validatedData.topic}`,
        type: 'LESSON_PLAN',
        metadata: validatedData,
      },
    });

    // Save messages
    await prisma.teacherAIMessage.createMany({
      data: [
        {
          conversationId: conversation.id,
          role: 'user',
          content: prompt,
          metadata: validatedData,
        },
        {
          conversationId: conversation.id,
          role: 'assistant',
          content: lessonPlanContent,
          promptTokens: tokensUsed * 0.3,
          completionTokens: tokensUsed * 0.7,
        },
      ],
    });

    // Track usage
    await trackUsage(tenantId, userId, 'lesson-plan', tokensUsed);

    res.json({
      conversationId: conversation.id,
      lessonPlan: lessonPlanContent,
      metadata: {
        subject: validatedData.subject,
        topic: validatedData.topic,
        gradeLevel: validatedData.gradeLevel,
        duration: validatedData.duration,
      },
    });
  } catch (error: any) {
    console.error('Lesson plan generation error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to generate lesson plan' });
  }
}

// ==================== QUIZ GENERATOR ====================

export async function generateQuiz(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);

    if (role !== 'TEACHER' && role !== 'BURSAR' && role !== 'SECRETARY' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only teachers can use this feature' });
    }

    const validatedData = quizSchema.parse(req.body);

    // Verify user exists
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!user) {
      console.error('Quiz Generation: User not found', { userId, tenantId });
      return res.status(404).json({ error: 'User not found in database' });
    }

    // Check rate limits
    const rateCheck = await checkRateLimits(tenantId, userId);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.error });
    }

    const prompt = generateQuizPrompt(validatedData);

    let quizContent: string;
    let tokensUsed = 0;

    if (openai) {
      const completion = await openai.chat.completions.create({
        model: DEPLOYMENT_NAME,
        messages: [
          { role: 'system', content: quizSystemPrompt },
          { role: 'user', content: prompt },
        ],
        max_completion_tokens: 3000,
      });

      quizContent = completion.choices[0]?.message?.content || 'Failed to generate quiz.';
      tokensUsed = completion.usage?.total_tokens || 0;
    } else {
      // Demo mode
      quizContent = generateDemoQuiz(validatedData);
      tokensUsed = 200;
    }

    // Create conversation record
    const conversation = await prisma.teacherAIConversation.create({
      data: {
        teacher: { connect: { id: userId } },
        tenant: { connect: { id: tenantId } },
        title: `Quiz: ${validatedData.topic}`,
        type: 'QUIZ',
        metadata: validatedData,
      },
    });

    // Save messages
    await prisma.teacherAIMessage.createMany({
      data: [
        {
          conversationId: conversation.id,
          role: 'user',
          content: prompt,
          metadata: validatedData,
        },
        {
          conversationId: conversation.id,
          role: 'assistant',
          content: quizContent,
          promptTokens: tokensUsed * 0.3,
          completionTokens: tokensUsed * 0.7,
        },
      ],
    });

    // Track usage
    await trackUsage(tenantId, userId, 'quiz', tokensUsed);

    res.json({
      conversationId: conversation.id,
      quiz: quizContent,
      metadata: {
        subject: validatedData.subject,
        topic: validatedData.topic,
        gradeLevel: validatedData.gradeLevel,
        questionCount: validatedData.questionCount,
        difficulty: validatedData.difficulty,
      },
    });
  } catch (error: any) {
    console.error('Quiz generation error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
}

// ==================== EMAIL DRAFTER ====================

export async function draftEmail(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);

    if (role !== 'TEACHER' && role !== 'BURSAR' && role !== 'SECRETARY' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only teachers can use this feature' });
    }

    const validatedData = emailSchema.parse(req.body);

    // Verify user exists
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!user) {
      console.error('Email Draft: User not found', { userId, tenantId });
      return res.status(404).json({ error: 'User not found in database' });
    }

    // Check rate limits
    const rateCheck = await checkRateLimits(tenantId, userId);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.error });
    }

    const context = await getTeacherContext(tenantId, userId);
    const prompt = generateEmailPrompt({
      ...validatedData,
      teacherName: context.teacherName,
      schoolName: context.schoolName,
    });

    let emailContent: string;
    let tokensUsed = 0;

    if (openai) {
      const completion = await openai.chat.completions.create({
        model: DEPLOYMENT_NAME,
        messages: [
          { role: 'system', content: emailSystemPrompt },
          { role: 'user', content: prompt },
        ],
        max_completion_tokens: 2000,
      });

      emailContent = completion.choices[0]?.message?.content || 'Failed to generate email.';
      tokensUsed = completion.usage?.total_tokens || 0;
    } else {
      // Demo mode
      emailContent = generateDemoEmail({
        ...validatedData,
        teacherName: context.teacherName,
        schoolName: context.schoolName,
      });
      tokensUsed = 150;
    }

    // Create conversation record
    const conversation = await prisma.teacherAIConversation.create({
      data: {
        teacher: { connect: { id: userId } },
        tenant: { connect: { id: tenantId } },
        title: `Email: ${validatedData.purpose} to ${validatedData.recipient}`,
        type: 'EMAIL',
        metadata: validatedData,
      },
    });

    // Save messages
    await prisma.teacherAIMessage.createMany({
      data: [
        {
          conversationId: conversation.id,
          role: 'user',
          content: prompt,
          metadata: validatedData,
        },
        {
          conversationId: conversation.id,
          role: 'assistant',
          content: emailContent,
          promptTokens: tokensUsed * 0.3,
          completionTokens: tokensUsed * 0.7,
        },
      ],
    });

    // Track usage
    await trackUsage(tenantId, userId, 'email', tokensUsed);

    res.json({
      conversationId: conversation.id,
      email: emailContent,
      metadata: {
        purpose: validatedData.purpose,
        recipient: validatedData.recipient,
        tone: validatedData.tone,
      },
    });
  } catch (error: any) {
    console.error('Email draft error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to draft email' });
  }
}

// ==================== CONVERSATIONS ====================

export async function getConversations(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { type, limit = 20, offset = 0 } = req.query;

    const where: any = { teacherId: userId, tenantId };
    if (type && ['CHAT', 'LESSON_PLAN', 'QUIZ', 'EMAIL'].includes(type as string)) {
      where.type = type;
    }

    const conversations = await prisma.teacherAIConversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
      select: {
        id: true,
        title: true,
        type: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    const total = await prisma.teacherAIConversation.count({ where });

    res.json({
      conversations,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
}

export async function getConversation(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    const conversation = await prisma.teacherAIConversation.findFirst({
      where: { id, teacherId: userId, tenantId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
}

export async function deleteConversation(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    const conversation = await prisma.teacherAIConversation.findFirst({
      where: { id, teacherId: userId, tenantId },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await prisma.teacherAIConversation.delete({ where: { id } });

    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
}

// ==================== TEMPLATES ====================

export async function getTemplates(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { type } = req.query;

    const where: any = {
      OR: [
        { teacherId: userId, tenantId },
        { isPublic: true, tenantId },
      ],
    };

    if (type && ['lesson-plan', 'quiz', 'email'].includes(type as string)) {
      where.type = type;
    }

    const templates = await prisma.teacherAITemplate.findMany({
      where,
      orderBy: { usageCount: 'desc' },
      select: {
        id: true,
        type: true,
        name: true,
        content: true,
        isPublic: true,
        usageCount: true,
        teacherId: true,
        createdAt: true,
      },
    });

    res.json(templates);
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
}

export async function saveTemplate(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const validatedData = templateSchema.parse(req.body);

    const template = await prisma.teacherAITemplate.create({
      data: {
        teacher: { connect: { id: userId } },
        tenant: { connect: { id: tenantId } },
        type: validatedData.type,
        name: validatedData.name,
        content: validatedData.content,
        isPublic: validatedData.isPublic,
      },
    });

    res.json(template);
  } catch (error: any) {
    console.error('Save template error:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to save template' });
  }
}

export async function deleteTemplate(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    const template = await prisma.teacherAITemplate.findFirst({
      where: { id, teacherId: userId, tenantId },
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await prisma.teacherAITemplate.delete({ where: { id } });

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
}

// ==================== USAGE STATS ====================

export async function getUsageStats(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);

    // Today's usage
    const todayUsage = await prisma.teacherAIUsage.aggregate({
      where: {
        teacherId: userId,
        tenantId,
        date: { gte: today },
      },
      _sum: { tokensUsed: true },
      _count: true,
    });

    // Weekly usage by feature
    const weeklyUsage = await prisma.teacherAIUsage.groupBy({
      by: ['feature'],
      where: {
        teacherId: userId,
        tenantId,
        date: { gte: thisWeek },
      },
      _sum: { tokensUsed: true },
      _count: true,
    });

    // Recent activity
    const recentConversations = await prisma.teacherAIConversation.findMany({
      where: { teacherId: userId, tenantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        type: true,
        createdAt: true,
      },
    });

    res.json({
      today: {
        messagesUsed: todayUsage._count || 0,
        tokensUsed: todayUsage._sum?.tokensUsed || 0,
        messagesLimit: DAILY_MESSAGE_LIMIT,
        tokensLimit: DAILY_TOKEN_LIMIT,
      },
      weekly: weeklyUsage.map((u: any) => ({
        feature: u.feature,
        count: u._count,
        tokensUsed: u._sum?.tokensUsed || 0,
      })),
      recentActivity: recentConversations,
    });
  } catch (error) {
    console.error('Get usage stats error:', error);
    res.status(500).json({ error: 'Failed to fetch usage stats' });
  }
}

// ==================== SUBJECTS (for forms) ====================

export async function getSubjects(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);

    const subjects = await prisma.subject.findMany({
      where: { tenantId },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });

    res.json(subjects);
  } catch (error) {
    console.error('Get subjects error:', error);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
}

// ==================== DOCUMENT EXPORT ====================

export async function exportConversationPDF(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Get conversation
    const conversation = await prisma.teacherAIConversation.findFirst({
      where: { id, teacherId: userId, tenantId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        teacher: { select: { fullName: true } },
        tenant: { select: { name: true } },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get the assistant's response (last message)
    const assistantMessage = conversation.messages.find((m: any) => m.role === 'assistant');
    if (!assistantMessage) {
      return res.status(404).json({ error: 'No content to export' });
    }

    const content = assistantMessage.content;
    const metadata = conversation.metadata as any || {};

    let pdfBuffer: Buffer;

    // Generate PDF based on conversation type
    switch (conversation.type) {
      case 'LESSON_PLAN':
        pdfBuffer = await generateLessonPlanPDF(content, {
          subject: metadata.subject || 'N/A',
          topic: metadata.topic || conversation.title,
          gradeLevel: metadata.gradeLevel || 0,
          duration: metadata.duration || 0,
          teacherName: conversation.teacher?.fullName,
          schoolName: conversation.tenant?.name,
        });
        break;

      case 'QUIZ':
        pdfBuffer = await generateQuizPDF(content, {
          subject: metadata.subject || 'N/A',
          topic: metadata.topic || conversation.title,
          gradeLevel: metadata.gradeLevel || 0,
          questionCount: metadata.questionCount || 0,
        });
        break;

      case 'EMAIL':
        pdfBuffer = await generateEmailPDF(content, {
          purpose: metadata.purpose || 'general',
          recipient: metadata.recipient || 'N/A',
        });
        break;

      default:
        // For CHAT type, use lesson plan format
        pdfBuffer = await generateLessonPlanPDF(content, {
          subject: 'Chat',
          topic: conversation.title,
          gradeLevel: 0,
          duration: 0,
          teacherName: conversation.teacher?.fullName,
          schoolName: conversation.tenant?.name,
        });
    }

    // Set headers and send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${conversation.title.replace(/[^a-z0-9]/gi, '_')}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Export PDF error:', error);
    res.status(500).json({ error: 'Failed to export PDF' });
  }
}

export async function exportConversationWord(req: TenantRequest, res: Response) {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Get conversation
    const conversation = await prisma.teacherAIConversation.findFirst({
      where: { id, teacherId: userId, tenantId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        teacher: { select: { fullName: true } },
        tenant: { select: { name: true } },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get the assistant's response (last message)
    const assistantMessage = conversation.messages.find((m: any) => m.role === 'assistant');
    if (!assistantMessage) {
      return res.status(404).json({ error: 'No content to export' });
    }

    const content = assistantMessage.content;
    const metadata = conversation.metadata as any || {};

    let wordBuffer: Buffer;

    // Generate Word document based on conversation type
    switch (conversation.type) {
      case 'LESSON_PLAN':
        wordBuffer = await generateLessonPlanWord(content, {
          subject: metadata.subject || 'N/A',
          topic: metadata.topic || conversation.title,
          gradeLevel: metadata.gradeLevel || 0,
          duration: metadata.duration || 0,
          teacherName: conversation.teacher?.fullName,
          schoolName: conversation.tenant?.name,
        });
        break;

      case 'QUIZ':
        wordBuffer = await generateQuizWord(content, {
          subject: metadata.subject || 'N/A',
          topic: metadata.topic || conversation.title,
          gradeLevel: metadata.gradeLevel || 0,
          questionCount: metadata.questionCount || 0,
        });
        break;

      case 'EMAIL':
        // For email, use lesson plan format (can be customized later)
        wordBuffer = await generateLessonPlanWord(content, {
          subject: 'Email',
          topic: conversation.title,
          gradeLevel: 0,
          duration: 0,
          teacherName: conversation.teacher?.fullName,
          schoolName: conversation.tenant?.name,
        });
        break;

      default:
        // For CHAT type, use lesson plan format
        wordBuffer = await generateLessonPlanWord(content, {
          subject: 'Chat',
          topic: conversation.title,
          gradeLevel: 0,
          duration: 0,
          teacherName: conversation.teacher?.fullName,
          schoolName: conversation.tenant?.name,
        });
    }

    // Set headers and send Word document
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${conversation.title.replace(/[^a-z0-9]/gi, '_')}.docx"`
    );
    res.send(wordBuffer);
  } catch (error) {
    console.error('Export Word error:', error);
    res.status(500).json({ error: 'Failed to export Word document' });
  }
}
