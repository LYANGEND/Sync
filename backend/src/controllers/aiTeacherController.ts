import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, getUserId, getUserRole } from '../utils/tenantContext';
import OpenAI, { AzureOpenAI } from 'openai';
import { getAzureOpenAIConfig, AzureOpenAIConfig } from '../services/settingsService';

const prisma = new PrismaClient() as any;

// Client cache to avoid recreating on every request
let cachedClient: OpenAI | AzureOpenAI | null = null;
let cachedConfig: AzureOpenAIConfig | null = null;
let configLastChecked = 0;
const CONFIG_CHECK_INTERVAL = 60 * 1000; // Re-check config every minute

/**
 * Get or create the OpenAI client dynamically
 * Reads from database settings with fallback to environment variables
 */
async function getOpenAIClient(): Promise<{ client: OpenAI | AzureOpenAI | null; deployment: string }> {
  const now = Date.now();
  
  // Check if we need to refresh config
  if (cachedClient && cachedConfig && (now - configLastChecked) < CONFIG_CHECK_INTERVAL) {
    return { client: cachedClient, deployment: cachedConfig.deployment };
  }
  
  // Get fresh config from database/env
  const config = await getAzureOpenAIConfig();
  configLastChecked = now;
  
  // Check if config changed
  const configChanged = !cachedConfig || 
    cachedConfig.apiKey !== config.apiKey ||
    cachedConfig.endpoint !== config.endpoint ||
    cachedConfig.apiVersion !== config.apiVersion;
  
  if (!configChanged && cachedClient) {
    return { client: cachedClient, deployment: config.deployment };
  }
  
  // Create new client if config is valid
  if (config.enabled && config.apiKey && config.endpoint) {
    console.log('AI Teacher: Initializing Azure OpenAI client from', 
      cachedConfig?.apiKey ? 'updated settings' : 'settings service');
    cachedClient = new AzureOpenAI({
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      apiVersion: config.apiVersion,
    });
    cachedConfig = config;
    console.log('AI Teacher: Using Azure OpenAI with deployment:', config.deployment);
    return { client: cachedClient, deployment: config.deployment };
  }
  
  // Try fallback to standard OpenAI
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && openaiKey !== 'your-openai-api-key') {
    cachedClient = new OpenAI({ apiKey: openaiKey });
    const deployment = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    console.log('AI Teacher: Using OpenAI with model:', deployment);
    return { client: cachedClient, deployment };
  }
  
  console.log('AI Teacher: No API configured - running in demo mode');
  cachedClient = null;
  cachedConfig = null;
  return { client: null, deployment: 'gpt-4o-mini' };
}

// Log initial config status
getAzureOpenAIConfig().then(config => {
  console.log('=== AI Teacher Configuration ===');
  console.log('Azure OpenAI configured:', config.enabled);
  if (config.enabled) {
    console.log('Endpoint:', config.endpoint);
    console.log('Deployment:', config.deployment);
    console.log('API Version:', config.apiVersion);
  }
  console.log('================================');
});

// Validation schemas
const sendMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  subjectId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  teachingMode: z.enum(['chat', 'lesson']).optional(),
  studentId: z.string().uuid().optional(), // For parents
});

// Rate limits
const DAILY_MESSAGE_LIMIT = 50; // Per user per day
const DAILY_TOKEN_LIMIT = 50000; // Per tenant per day

// System prompt for the AI Teacher
const getSystemPrompt = (context: {
  studentName?: string;
  className?: string;
  subjectName?: string;
  topicName?: string;
  schoolName?: string;
  syllabus?: string;
  teachingMode?: 'chat' | 'lesson';
  studentAge?: number; // Add age context
}) => {
  const isLesson = context.teachingMode === 'lesson';
  const isYoungLearner = context.studentAge && context.studentAge <= 12; // Pre-school to primary
  
  return `You are an AI Teaching Assistant at ${context.schoolName || 'the school'}. ${isLesson ? 'You are conducting a LIVE LESSON - teach like a real classroom teacher with clear explanations, examples, and interactive questions.' : 'Your role is to help students learn and understand their subjects.'}

${context.studentName ? `You are helping ${context.studentName}` : ''}${context.className ? ` from ${context.className}` : ''}.
${context.subjectName ? `Current subject: ${context.subjectName}` : ''}${context.topicName ? `\nCurrent topic: ${context.topicName}` : ''}

${isYoungLearner ? `
🧒 YOUNG LEARNER MODE (Ages 4-12):
You are teaching a young child. Adapt your approach:

1. **Use Simple, Clear Language**: Short sentences, everyday words, avoid jargon
2. **Be Encouraging & Positive**: Celebrate effort, use encouraging phrases like "Great try!", "You're doing amazing!"
3. **Make It Playful**: Use emojis, stories, games, and fun examples
4. **Break Into Tiny Steps**: Very small, manageable chunks of information
5. **Use Concrete Examples**: Real-world objects and situations they can relate to
6. **Ask Simple Questions**: One concept at a time, yes/no or simple choice questions
7. **Provide Immediate Feedback**: Quick, positive reinforcement
8. **Keep It Interactive**: Frequent engagement, not long lectures
9. **Use Visual Aids Liberally**: Diagrams, pictures, colors for EVERY concept
10. **Connect to Their World**: Use examples from their daily life, favorite things

SAFETY GUARDRAILS:
- NEVER discuss inappropriate topics (violence, adult content, politics, religion)
- NEVER ask for personal information (address, phone, school name, etc.)
- NEVER provide medical, legal, or safety advice
- If asked inappropriate questions, gently redirect: "That's a great question for your teacher or parent!"
- Keep all content age-appropriate and educational
- Focus on building confidence and love of learning
` : ''}

VISUAL TEACHING FORMAT - Use these special tags for rich visual explanations:

1. **Math Equations**: Use LaTeX format with $ for inline ($x^2 + y^2 = z^2$) or $$ for display:
   $$E = mc^2$$
   $$\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$

2. **Diagrams with Mermaid**: ALWAYS use diagrams when explaining:
   - **Processes & Workflows**: Use flowcharts for step-by-step processes
   - **Cycles**: Use circular diagrams for repeating processes (water cycle, life cycles, photosynthesis)
   - **Hierarchies**: Use tree diagrams for classifications, family trees, organizational structures
   - **Relationships**: Use graphs to show connections between concepts
   - **Sequences**: Use sequence diagrams for timelines or ordered events
   - **Comparisons**: Use side-by-side structures to compare concepts
   
   Example flowchart:
   \`\`\`mermaid
   graph TD
       A[Start] --> B{Decision}
       B -->|Yes| C[Action 1]
       B -->|No| D[Action 2]
   \`\`\`
   
   Example cycle:
   \`\`\`mermaid
   graph LR
       A[Stage 1] --> B[Stage 2]
       B --> C[Stage 3]
       C --> D[Stage 4]
       D --> A
   \`\`\`
   
   WHEN TO USE DIAGRAMS (Use liberally!):
   - Biology: Cell structures, body systems, food chains, life cycles, photosynthesis, respiration
   - Chemistry: Molecular structures, reaction processes, periodic table relationships
   - Physics: Force diagrams, circuit diagrams, energy transformations
   - Math: Problem-solving steps, geometric relationships, function transformations
   - History: Timelines, cause-and-effect chains, historical connections
   - Geography: Water cycle, rock cycle, climate systems
   - Computer Science: Algorithms, data structures, program flow
   - Language: Sentence structure, story plots, argument structure
   - Any process with multiple steps or interconnected concepts

3. **Concept Cards**: Use special tags for visual emphasis:
   [DEFINITION: Term] The explanation of the term
   [EXAMPLE: Title] A concrete example
   [TIP: Title] A helpful tip or trick
   [WARNING: Title] Common mistake to avoid
   [STEP 1: Title] First step in a process
   [STEP 2: Title] Second step, and so on

4. **Structure**: Use ## for main sections and ### for subsections

${isLesson ? `LIVE LESSON MODE - Teaching Guidelines:
1. Start with a warm introduction and lesson overview
2. Explain concepts step-by-step with clear examples
3. ALWAYS use diagrams to illustrate processes, cycles, and relationships
4. Include math equations properly formatted when relevant
5. Ask the student questions to check understanding
6. Provide practice problems and wait for answers
7. Use [STEP N:] cards for sequential processes
8. Create visual diagrams for every major concept
9. Summarize key points with visual emphasis
10. Speak as if you're in front of a classroom${isYoungLearner ? '\n11. Keep energy high and use lots of encouragement\n12. Use simple language and short explanations\n13. Make it fun with games and stories' : ''}` : `Chat Guidelines:
1. Be encouraging and supportive while maintaining academic rigor
2. Explain concepts clearly using visual elements when helpful
3. ALWAYS use diagrams for processes, cycles, and relationships
4. Format math equations properly with $ or $$
5. Use concept cards ([DEFINITION:], [EXAMPLE:], [TIP:]) for key points
6. When solving problems, use [STEP N:] cards for each step
7. Create diagrams to visualize complex concepts
8. Encourage critical thinking by asking follow-up questions
9. Stay focused on educational content
10. Be patient and never make students feel bad for asking questions${isYoungLearner ? '\n11. Use simple words and short sentences\n12. Celebrate every effort and progress\n13. Make learning feel like play' : ''}`}

${context.syllabus ? `Relevant syllabus content:\n${context.syllabus}` : ''}

Remember: Your goal is to help students learn and build confidence. Use visual elements to make explanations clearer and more engaging!${isLesson ? ' Keep the lesson engaging and interactive!' : ''}${isYoungLearner ? ' Make learning fun and safe for young minds!' : ''}`;
};

// Demo mode response generator (when no API is configured)
const generateDemoResponse = (question: string, subjectName?: string, topicName?: string): string => {
  const subject = subjectName || 'this subject';
  const topic = topicName || 'this topic';
  
  // Check for common question types and provide helpful demo responses
  const questionLower = question.toLowerCase();
  
  if (questionLower.includes('photosynthesis')) {
    return `## Photosynthesis Explained

[DEFINITION: Photosynthesis] The process by which green plants convert sunlight, water, and carbon dioxide into glucose and oxygen.

### The Chemical Equation

$$6CO_2 + 6H_2O + \\text{light energy} \\rightarrow C_6H_{12}O_6 + 6O_2$$

### The Process Step by Step

[STEP 1: Light Absorption] Chlorophyll in the leaves absorbs sunlight energy

[STEP 2: Water Splitting] Water molecules ($H_2O$) are split into hydrogen and oxygen

[STEP 3: Carbon Fixation] Carbon dioxide ($CO_2$) is combined with hydrogen to make glucose

[STEP 4: Energy Storage] Glucose ($C_6H_{12}O_6$) stores the energy for the plant to use

\`\`\`mermaid
graph TD
    A[Sunlight] --> B[Chlorophyll in Leaf]
    C[Water from roots] --> B
    D[CO2 from air] --> B
    B --> E[Glucose - Food]
    B --> F[Oxygen - Released]
\`\`\`

[TIP: Remember] Plants are like solar-powered food factories!

**🎯 Demo Mode:** Configure your OpenAI API key in .env to unlock full AI teaching capabilities.`;
  }
  
  if (questionLower.includes('quadratic') || questionLower.includes('equation')) {
    return `## Solving Quadratic Equations

[DEFINITION: Quadratic Equation] An equation of the form $ax^2 + bx + c = 0$ where $a \\neq 0$

### The Quadratic Formula

$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

### Example: Solve $x^2 + 5x + 6 = 0$

[STEP 1: Identify coefficients] $a = 1$, $b = 5$, $c = 6$

[STEP 2: Calculate discriminant] $b^2 - 4ac = 25 - 24 = 1$

[STEP 3: Apply formula] $x = \\frac{-5 \\pm \\sqrt{1}}{2} = \\frac{-5 \\pm 1}{2}$

[STEP 4: Find solutions] $x_1 = -2$ and $x_2 = -3$

[TIP: Check your work] Substitute back: $(-2)^2 + 5(-2) + 6 = 4 - 10 + 6 = 0$ ✓

**🎯 Demo Mode:** Configure your OpenAI API key to get personalized help with any equation!`;
  }

  // Generic demo response
  return `## AI Teacher Demo Mode

Hello! I received your question about "${question.slice(0, 50)}${question.length > 50 ? '...' : ''}"

${subjectName ? `[DEFINITION: Subject Focus] ${subjectName}` : ''}
${topicName ? `[DEFINITION: Current Topic] ${topicName}` : ''}

### How the AI Teacher Works

When properly configured, I can:

1. **Explain concepts** with visual diagrams and equations
2. **Solve problems** step-by-step with [STEP N:] cards
3. **Create practice questions** to test your understanding
4. **Use math notation** like $E = mc^2$ and complex formulas
5. **Draw diagrams** using Mermaid charts

\`\`\`mermaid
graph LR
    A[Your Question] --> B[AI Teacher]
    B --> C[Visual Explanation]
    B --> D[Step-by-Step Solution]
    B --> E[Practice Problems]
\`\`\`

[WARNING: Demo Mode Active] To unlock full AI capabilities, add your OpenAI API key:

1. Get an API key from [OpenAI](https://platform.openai.com/api-keys)
2. Add to your \`.env\` file:
   \`\`\`
   OPENAI_API_KEY=sk-your-key-here
   \`\`\`
3. Restart the backend server

[TIP: Alternative] You can also use Azure OpenAI if you have an Azure account.

**Would you like me to show you more demo features?**`;
};

// Check rate limits
const checkRateLimits = async (tenantId: string, userId: string): Promise<{ allowed: boolean; error?: string }> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check user's daily message count
  const userUsage = await prisma.aIUsage.findUnique({
    where: {
      tenantId_userId_date: {
        tenantId,
        userId,
        date: today,
      },
    },
  });

  if (userUsage && userUsage.messagesCount >= DAILY_MESSAGE_LIMIT) {
    return {
      allowed: false,
      error: `You've reached your daily limit of ${DAILY_MESSAGE_LIMIT} messages. Try again tomorrow!`,
    };
  }

  // Check tenant's daily token usage
  const tenantUsage = await prisma.aIUsage.aggregate({
    where: {
      tenantId,
      date: today,
    },
    _sum: {
      tokensUsed: true,
    },
  });

  if (tenantUsage._sum.tokensUsed && tenantUsage._sum.tokensUsed >= DAILY_TOKEN_LIMIT) {
    return {
      allowed: false,
      error: 'The school has reached its daily AI usage limit. Please try again tomorrow.',
    };
  }

  return { allowed: true };
};

// Update usage tracking
const updateUsage = async (tenantId: string, userId: string, tokens: number) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.aIUsage.upsert({
    where: {
      tenantId_userId_date: {
        tenantId,
        userId,
        date: today,
      },
    },
    update: {
      messagesCount: { increment: 1 },
      tokensUsed: { increment: tokens },
    },
    create: {
      tenantId,
      userId,
      date: today,
      messagesCount: 1,
      tokensUsed: tokens,
    },
  });
};

// Send a message to the AI Teacher
export const sendMessage = async (req: TenantRequest, res: Response) => {
  console.log('\n=== AI Teacher: sendMessage called ===');
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);
    console.log('tenantId:', tenantId);
    console.log('userId:', userId);
    console.log('role:', role);
    console.log('request body:', JSON.stringify(req.body).slice(0, 200));
    
    const data = sendMessageSchema.parse(req.body);
    console.log('Parsed data - message:', data.message.slice(0, 50) + '...');

    // Check rate limits
    const rateCheck = await checkRateLimits(tenantId, userId);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: rateCheck.error });
    }

    // Get student context
    let student = null;
    if (role === 'PARENT' && data.studentId) {
      student = await prisma.student.findFirst({
        where: { id: data.studentId, tenantId, parentId: userId },
        include: { class: true },
      });
      if (!student) {
        return res.status(403).json({ error: 'Unauthorized: Not your child' });
      }
    } else if (role === 'STUDENT') {
      student = await prisma.student.findFirst({
        where: { userId, tenantId },
        include: { class: true },
      });
    }

    // Get subject context if provided
    let subject = null;
    if (data.subjectId) {
      subject = await prisma.subject.findFirst({
        where: { id: data.subjectId, tenantId },
      });
    }

    // Get topic context if provided
    let topic = null;
    if (data.topicId) {
      topic = await prisma.syllabusEntry.findFirst({
        where: { id: data.topicId, tenantId },
        select: { id: true, topic: true, description: true },
      });
    }

    // Get tenant info for school name and feature check
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, aiTutorEnabled: true },
    });

    if (!tenant?.aiTutorEnabled) {
      return res.status(403).json({ 
        error: 'AI Tutor is not included in your current subscription plan.',
        requiresUpgrade: true 
      });
    }

    // Get or create conversation
    let conversation;
    if (data.conversationId) {
      conversation = await prisma.aIConversation.findFirst({
        where: {
          id: data.conversationId,
          tenantId,
          OR: [
            { userId },
            { studentId: student?.id },
          ],
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 50, // Last 50 messages for better context retention
          },
        },
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else {
      // Create new conversation
      conversation = await prisma.aIConversation.create({
        data: {
          tenantId,
          userId: role === 'STUDENT' ? userId : null,
          studentId: student?.id,
          subjectId: data.subjectId,
          title: data.message.slice(0, 50) + (data.message.length > 50 ? '...' : ''),
        },
        include: {
          messages: true,
        },
      });
    }

    // Build message history for OpenAI
    const systemPrompt = getSystemPrompt({
      studentName: student ? `${student.firstName} ${student.lastName}` : undefined,
      className: student?.class?.name,
      subjectName: subject?.name,
      topicName: topic?.topic,
      schoolName: tenant?.name,
      teachingMode: data.teachingMode,
    });

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    for (const msg of conversation.messages) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // Add new user message
    messages.push({ role: 'user', content: data.message });

    let assistantMessage: string;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    // Get OpenAI client dynamically (reads from DB settings or env)
    const { client: openai, deployment } = await getOpenAIClient();
    console.log('openai client exists:', !!openai);
    console.log('deployment:', deployment);
    console.log('Number of messages:', messages.length);

    if (openai) {
      try {
        console.log('Calling OpenAI API...');
        // Call OpenAI API (Azure or regular)
        const completion = await openai.chat.completions.create({
          model: deployment,
          messages,
          max_completion_tokens: 1000,
        });
        console.log('OpenAI API response received');

        assistantMessage = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response. Please try again.';
        promptTokens = completion.usage?.prompt_tokens || 0;
        completionTokens = completion.usage?.completion_tokens || 0;
        totalTokens = promptTokens + completionTokens;
        console.log('Tokens used:', totalTokens);
      } catch (apiError: any) {
        console.error('OpenAI API Error:', apiError.message);
        console.error('Error status:', apiError.status);
        console.error('Error code:', apiError.code);
        console.error('Full error:', JSON.stringify(apiError, null, 2));
        
        // Fall back to demo mode on API error
        console.log('Falling back to demo mode...');
        assistantMessage = generateDemoResponse(data.message, subject?.name, topic?.topic);
        assistantMessage += `\n\n[ERROR: ${apiError.message}]`;
        totalTokens = 0;
      }
    } else {
      console.log('Using demo mode (no API configured)');
      // Demo mode - provide helpful response without API
      assistantMessage = generateDemoResponse(data.message, subject?.name, topic?.topic);
      totalTokens = 0;
    }

    // Save messages to database
    const [userMsg, aiMsg] = await Promise.all([
      prisma.aIMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: data.message,
          promptTokens: 0,
          completionTokens: 0,
        },
      }),
      prisma.aIMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: assistantMessage,
          promptTokens,
          completionTokens,
        },
      }),
    ]);

    // Update conversation token count
    await prisma.aIConversation.update({
      where: { id: conversation.id },
      data: {
        totalTokensUsed: { increment: totalTokens },
      },
    });

    // Update usage tracking
    await updateUsage(tenantId, userId, totalTokens);

    res.json({
      conversationId: conversation.id,
      message: {
        id: aiMsg.id,
        role: 'assistant',
        content: assistantMessage,
        createdAt: aiMsg.createdAt,
      },
      tokensUsed: totalTokens,
    });
  } catch (error: any) {
    console.error('=== AI Teacher sendMessage ERROR ===');
    if (error instanceof z.ZodError) {
      console.error('Zod validation error:', error.errors);
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    if (error.response) {
      console.error('Error response:', error.response);
    }
    res.status(500).json({ error: 'Failed to get AI response', details: error.message });
  }
};

// Get conversation history
export const getConversations = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);
    const { studentId } = req.query;

    const where: any = { tenantId };

    if (role === 'PARENT' && studentId) {
      // Verify parent owns this student
      const student = await prisma.student.findFirst({
        where: { id: studentId as string, tenantId, parentId: userId },
      });
      if (!student) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      where.studentId = studentId;
    } else if (role === 'STUDENT') {
      where.userId = userId;
    } else {
      where.userId = userId;
    }

    const conversations = await prisma.aIConversation.findMany({
      where,
      include: {
        subject: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    res.json(conversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

// Get single conversation with messages
export const getConversation = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);
    const { conversationId } = req.params;

    const conversation = await prisma.aIConversation.findFirst({
      where: {
        id: conversationId,
        tenantId,
      },
      include: {
        subject: { select: { id: true, name: true } },
        student: { select: { id: true, firstName: true, lastName: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check authorization
    if (role === 'PARENT') {
      const student = await prisma.student.findFirst({
        where: { id: conversation.studentId, parentId: userId },
      });
      if (!student) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    } else if (conversation.userId && conversation.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
};

// Delete a conversation
export const deleteConversation = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { conversationId } = req.params;

    const conversation = await prisma.aIConversation.findFirst({
      where: {
        id: conversationId,
        tenantId,
        userId,
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await prisma.aIConversation.delete({
      where: { id: conversationId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
};

// Get usage stats
export const getUsageStats = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const userUsage = await prisma.aIUsage.findUnique({
      where: {
        tenantId_userId_date: {
          tenantId,
          userId,
          date: today,
        },
      },
    });

    res.json({
      messagesUsed: userUsage?.messagesCount || 0,
      messagesLimit: DAILY_MESSAGE_LIMIT,
      messagesRemaining: DAILY_MESSAGE_LIMIT - (userUsage?.messagesCount || 0),
    });
  } catch (error) {
    console.error('Get usage stats error:', error);
    res.status(500).json({ error: 'Failed to fetch usage stats' });
  }
};

// Get available subjects for AI tutoring
export const getSubjects = async (req: TenantRequest, res: Response) => {
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
};

// Get topics for a specific subject
export const getTopicsBySubject = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { subjectId } = req.params;

    // Get topics from syllabus entries for this subject
    const syllabusTopics = await prisma.syllabusEntry.findMany({
      where: { 
        tenantId,
        subjectId,
      },
      select: { 
        id: true, 
        topic: true, 
        description: true,
        subjectId: true,
      },
      orderBy: { week: 'asc' },
    });

    // Map syllabus entries to topic format
    const topics = syllabusTopics.map((entry: any) => ({
      id: entry.id,
      name: entry.topic,
      description: entry.description,
      subjectId: entry.subjectId,
    }));

    // Remove duplicates by topic name
    const uniqueTopics = topics.filter((topic: any, index: number, self: any[]) =>
      index === self.findIndex((t) => t.name === topic.name)
    );

    res.json(uniqueTopics);
  } catch (error) {
    console.error('Get topics by subject error:', error);
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
};

// Get related video lessons for a subject
export const getRelatedVideoLessons = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);
    const { subjectId } = req.params;

    // Get student's class if student role
    let classIds: string[] = [];
    if (role === 'STUDENT') {
      const student = await prisma.student.findFirst({
        where: { userId, tenantId },
        select: { classId: true },
      });
      if (student?.classId) {
        classIds = [student.classId];
      }
    } else if (role === 'PARENT') {
      // Get all children's classes
      const children = await prisma.student.findMany({
        where: { parentId: userId, tenantId },
        select: { classId: true },
      });
      classIds = children.map((c: any) => c.classId).filter(Boolean);
    }

    const now = new Date();
    const videoLessons = await prisma.videoLesson.findMany({
      where: {
        tenantId,
        subjectId: subjectId || undefined,
        ...(classIds.length > 0 ? { classId: { in: classIds } } : {}),
        OR: [
          { status: 'LIVE' },
          { status: 'SCHEDULED', scheduledStart: { gte: now } },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        scheduledStart: true,
        scheduledEnd: true,
        status: true,
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, fullName: true } },
        class: { select: { id: true, name: true } },
      },
      orderBy: { scheduledStart: 'asc' },
      take: 5,
    });

    res.json(videoLessons);
  } catch (error) {
    console.error('Get related video lessons error:', error);
    res.status(500).json({ error: 'Failed to fetch video lessons' });
  }
};

// Get related homework for a subject
export const getRelatedHomework = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);
    const { subjectId } = req.params;

    // Get student info
    let studentId: string | null = null;
    let classId: string | null = null;

    if (role === 'STUDENT') {
      const student = await prisma.student.findFirst({
        where: { userId, tenantId },
        select: { id: true, classId: true },
      });
      if (student) {
        studentId = student.id;
        classId = student.classId;
      }
    }

    if (!classId) {
      return res.json([]);
    }

    const now = new Date();
    const homework = await prisma.homework.findMany({
      where: {
        tenantId,
        subjectContent: {
          classId,
          ...(subjectId ? { subjectId } : {}),
        },
        dueDate: { gte: now },
      },
      select: {
        id: true,
        title: true,
        description: true,
        dueDate: true,
        maxPoints: true,
        requiresSubmission: true,
        subjectContent: {
          select: {
            subject: { select: { id: true, name: true } },
          },
        },
        submissions: studentId ? {
          where: { studentId },
          select: { id: true, status: true },
          take: 1,
        } : false,
      },
      orderBy: { dueDate: 'asc' },
      take: 5,
    });

    // Format response
    const formattedHomework = homework.map((hw: any) => ({
      id: hw.id,
      title: hw.title,
      description: hw.description,
      dueDate: hw.dueDate,
      maxPoints: hw.maxPoints,
      subject: hw.subjectContent?.subject,
      submitted: hw.submissions?.length > 0,
      submissionStatus: hw.submissions?.[0]?.status,
    }));

    res.json(formattedHomework);
  } catch (error) {
    console.error('Get related homework error:', error);
    res.status(500).json({ error: 'Failed to fetch homework' });
  }
};

// Get related assessments for a subject
export const getRelatedAssessments = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);
    const { subjectId } = req.params;

    // Get student info
    let studentId: string | null = null;
    let classId: string | null = null;

    if (role === 'STUDENT') {
      const student = await prisma.student.findFirst({
        where: { userId, tenantId },
        select: { id: true, classId: true },
      });
      if (student) {
        studentId = student.id;
        classId = student.classId;
      }
    }

    if (!classId) {
      return res.json([]);
    }

    const now = new Date();
    const assessments = await prisma.assessment.findMany({
      where: {
        tenantId,
        classId,
        ...(subjectId ? { subjectId } : {}),
        date: { gte: now },
        isOnline: true,
      },
      select: {
        id: true,
        title: true,
        type: true,
        date: true,
        totalMarks: true,
        subject: { select: { id: true, name: true } },
        questions: { select: { id: true } },
        results: studentId ? {
          where: { studentId },
          select: { id: true, marksObtained: true },
          take: 1,
        } : false,
      },
      orderBy: { date: 'asc' },
      take: 5,
    });

    // Format response
    const formattedAssessments = assessments.map((a: any) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      date: a.date,
      totalMarks: a.totalMarks,
      subject: a.subject,
      questionCount: a.questions?.length || 0,
      completed: a.results?.length > 0,
      score: a.results?.[0]?.marksObtained,
    }));

    res.json(formattedAssessments);
  } catch (error) {
    console.error('Get related assessments error:', error);
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
};
