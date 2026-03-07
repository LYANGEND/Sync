import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import aiService from '../services/aiService';
import aiUsageTracker from '../services/aiUsageTracker';
import { AuthRequest } from '../middleware/authMiddleware';
import * as convoService from '../services/conversationService';

// ==========================================
// Conversation Management
// ==========================================

export const createConversation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { title, context } = req.body;
    const conversation = await convoService.createConversation(
      userId, 'teaching-assistant', title || 'New Conversation', context || {},
    );
    res.status(201).json(conversation);
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};

export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const conversations = await convoService.listConversationsExcluding(userId, 'financial-advisor');
    res.json(conversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

export const deleteConversation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    await convoService.deleteConversation(req.params.id, userId);
    res.json({ message: 'Conversation deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
};

export const getConversation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const result = await convoService.getConversation(req.params.id, userId);
    if (!result) return res.status(404).json({ error: 'Conversation not found' });
    res.json(result);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
};

// ==========================================
// Chat / Message Handling
// ==========================================

export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { conversationId, message, context } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get or create conversation
    let conversation: any;
    if (conversationId) {
      conversation = await prisma.aIConversation.findFirst({
        where: { id: conversationId, userId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
    }

    if (!conversation) {
      conversation = await prisma.aIConversation.create({
        data: {
          userId,
          title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
          context: { ...(context || {}), type: 'teaching-assistant' },
        },
        include: { messages: true },
      });
    }

    // Save user message
    await prisma.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    });

    // Build context for AI — load teacher's real data
    const teacherCtx = await getTeacherContext(userId);
    let classInsights = '';
    if (context?.classId) {
      classInsights = await getClassInsights(context.classId);
    }
    const systemPrompt = buildSystemPrompt(context, teacherCtx.summary, classInsights);
    const previousMessages = conversation.messages.slice(-20).map((m: any) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    const chatMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...previousMessages,
      { role: 'user' as const, content: message },
    ];

    // Call AI
    const startTime = Date.now();
    const aiResponse = await aiService.chat(chatMessages, {
      temperature: 0.7,
      maxTokens: 3000,
    });
    const responseTimeMs = Date.now() - startTime;

    // Track usage
    aiUsageTracker.track({
      userId,
      branchId: req.user?.branchId,
      feature: 'teaching-assistant',
      action: context?.systemOverride ? 'slash-command' : 'chat',
      tokensUsed: aiResponse.tokensUsed,
      responseTimeMs,
      model: aiResponse.model,
      metadata: context?.systemOverride ? { command: message.split(' ')[0] } : undefined,
    });

    // Save assistant response
    const assistantMessage = await prisma.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: aiResponse.content,
        tokenCount: aiResponse.tokensUsed || null,
      },
    });

    // Update conversation
    await prisma.aIConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    res.json({
      conversationId: conversation.id,
      message: assistantMessage,
      tokensUsed: aiResponse.tokensUsed,
    });
  } catch (error: any) {
    console.error('AI message error:', error);
    res.status(500).json({ error: error.message || 'Failed to process AI request' });
  }
};

// ==========================================
// Slash Commands
// ==========================================

export const handleSlashCommand = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { command, params, conversationId } = req.body;

    let prompt = '';
    let systemOverride = '';

    switch (command) {
      case '/lesson':
        systemOverride = 'You are a Zambian curriculum expert. Create detailed, standards-aligned lesson plans.';
        prompt = `Create a detailed lesson plan for: ${params.topic || params.text}
Grade Level: ${params.gradeLevel || 'Not specified'}
Subject: ${params.subject || 'Not specified'}
Duration: ${params.duration || '40 minutes'}

Include: Objectives, Materials, Introduction (5 min), Development (25 min), Conclusion (10 min), Assessment, and Differentiation strategies.`;
        break;

      case '/quiz':
        systemOverride = 'You are an assessment expert. Create high-quality quiz questions with answer keys.';
        prompt = `Create a quiz with ${params.count || 10} questions on: ${params.topic || params.text}
Grade Level: ${params.gradeLevel || 'Not specified'}
Subject: ${params.subject || 'Not specified'}
Question Types: ${params.types || 'Mix of multiple choice, true/false, and short answer'}

Include answer key and point values. Vary difficulty across Bloom's taxonomy levels.`;
        break;

      case '/email':
        systemOverride = 'You are a professional school communicator. Write clear, warm, professional emails.';
        prompt = `Draft a professional email for a school context:
Purpose: ${params.purpose || params.text}
Audience: ${params.audience || 'Parents'}
Tone: ${params.tone || 'Professional and warm'}`;
        break;

      case '/tips':
        systemOverride = 'You are a teaching methodology expert specializing in Zambian education.';
        prompt = `Provide 5-7 practical teaching tips for: ${params.topic || params.text}
Grade Level: ${params.gradeLevel || 'Not specified'}
Context: Zambian classroom with limited resources`;
        break;

      case '/rubric':
        systemOverride = 'You are an assessment expert. Create detailed, fair rubrics.';
        prompt = `Create a detailed grading rubric for: ${params.assignment || params.text}
Grade Level: ${params.gradeLevel || 'Not specified'}
Subject: ${params.subject || 'Not specified'}
Criteria: ${params.criteria || '4-5 criteria with 4 performance levels each'}

Include point values and clear descriptions for each performance level.`;
        break;

      case '/differentiate':
        systemOverride = 'You are a differentiated instruction expert.';
        prompt = `Create differentiated versions of this content/activity: ${params.text}
Grade Level: ${params.gradeLevel || 'Not specified'}

Create 3 versions:
1. Below grade level (simplified language, visual supports)
2. On grade level (standard)
3. Above grade level (extended challenge, deeper analysis)

Also add ELL (English Language Learner) modifications.`;
        break;

      default:
        return res.status(400).json({ error: `Unknown command: ${command}` });
    }

    // Forward to sendMessage logic
    req.body = { conversationId, message: prompt, context: { systemOverride } };
    return sendMessage(req as any, res);
  } catch (error) {
    console.error('Slash command error:', error);
    res.status(500).json({ error: 'Failed to process command' });
  }
};

// ==========================================
// Artifacts
// ==========================================

export const saveArtifact = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { conversationId, type, title, content, metadata } = req.body;

    const artifact = await prisma.aIArtifact.create({
      data: {
        conversationId,
        userId,
        type: type || 'OTHER',
        title: title || 'Untitled',
        content,
        metadata: metadata || null,
      },
    });

    res.status(201).json(artifact);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save artifact' });
  }
};

export const getArtifacts = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { type } = req.query;
    const where: any = { userId };
    if (type) where.type = type;

    const artifacts = await prisma.aIArtifact.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    res.json(artifacts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch artifacts' });
  }
};

export const deleteArtifact = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    await prisma.aIArtifact.deleteMany({
      where: { id, userId },
    });

    res.json({ message: 'Artifact deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete artifact' });
  }
};

export const publishArtifactToHomework = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const { classId, subjectId, termId, dueDate } = req.body;

    const artifact = await prisma.aIArtifact.findFirst({
      where: { id, userId },
    });

    if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

    // Create an assessment from the artifact
    const assessment = await prisma.assessment.create({
      data: {
        title: artifact.title,
        type: 'HOMEWORK',
        description: `AI-generated: ${artifact.title}`,
        classId,
        subjectId,
        termId,
        totalMarks: 100,
        weight: 10,
        date: new Date(dueDate || Date.now()),
      },
    });

    // Mark artifact as published
    await prisma.aIArtifact.update({
      where: { id },
      data: { isPublished: true },
    });

    res.json({ message: 'Published to homework', assessmentId: assessment.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to publish artifact' });
  }
};

// ==========================================
// Favorite Prompts
// ==========================================

export const getFavoritePrompts = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const prompts = await prisma.aIFavoritePrompt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(prompts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
};

export const saveFavoritePrompt = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { title, prompt, category } = req.body;

    const saved = await prisma.aIFavoritePrompt.create({
      data: {
        userId,
        title,
        prompt,
        category: category || 'general',
      },
    });

    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save prompt' });
  }
};

export const deleteFavoritePrompt = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    await prisma.aIFavoritePrompt.deleteMany({
      where: { id, userId },
    });

    res.json({ message: 'Prompt deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
};

// ==========================================
// Teacher Context (classes, subjects)
// ==========================================

export const getTeachingContext = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const ctx = await getTeacherContext(userId);
    res.json({ classes: ctx.classes, subjects: ctx.subjects });
  } catch (error) {
    console.error('Get teaching context error:', error);
    res.status(500).json({ error: 'Failed to load teaching context' });
  }
};

// ==========================================
// Student Performance Insights
// ==========================================

export const getStudentInsights = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { classId, subjectId } = req.query;
    if (!classId) return res.status(400).json({ error: 'classId is required' });

    const cls = await prisma.class.findUnique({
      where: { id: classId as string },
      include: {
        students: {
          where: { status: 'ACTIVE' },
          select: { id: true, firstName: true, lastName: true, gender: true },
          orderBy: { lastName: 'asc' },
        },
        academicTerm: true,
      },
    });
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const studentIds = cls.students.map((s: any) => s.id);

    // Attendance last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const attendance = await prisma.attendance.findMany({
      where: {
        studentId: { in: studentIds },
        date: { gte: thirtyDaysAgo },
      },
    });

    // Per-student attendance
    const attByStudent: Record<string, { present: number; late: number; absent: number; total: number }> = {};
    for (const a of attendance) {
      if (!attByStudent[(a as any).studentId]) attByStudent[(a as any).studentId] = { present: 0, late: 0, absent: 0, total: 0 };
      const entry = attByStudent[(a as any).studentId];
      entry.total++;
      if ((a as any).status === 'PRESENT') entry.present++;
      else if ((a as any).status === 'LATE') entry.late++;
      else entry.absent++;
    }

    // Term results
    const termResultsWhere: any = { classId: classId as string };
    if (cls.academicTerm) termResultsWhere.termId = cls.academicTerm.id;
    if (subjectId) termResultsWhere.subjectId = subjectId as string;

    const termResults = await prisma.termResult.findMany({
      where: termResultsWhere,
      include: { subject: { select: { name: true } } },
    });

    // Per-student scores
    const scoresByStudent: Record<string, { subjects: Record<string, number>; total: number; count: number }> = {};
    for (const r of termResults) {
      const sid = (r as any).studentId;
      if (!scoresByStudent[sid]) scoresByStudent[sid] = { subjects: {}, total: 0, count: 0 };
      const entry = scoresByStudent[sid];
      const score = Number((r as any).totalScore);
      entry.subjects[(r as any).subject.name] = score;
      entry.total += score;
      entry.count++;
    }

    // Build student insights
    const students = cls.students.map((s: any) => {
      const att = attByStudent[s.id] || { present: 0, late: 0, absent: 0, total: 0 };
      const scores = scoresByStudent[s.id] || { subjects: {}, total: 0, count: 0 };
      const avgScore = scores.count > 0 ? scores.total / scores.count : null;
      const attendanceRate = att.total > 0 ? Math.round((att.present / att.total) * 100) : null;

      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        gender: s.gender,
        averageScore: avgScore ? Number(avgScore.toFixed(1)) : null,
        attendanceRate,
        attendanceDays: att,
        subjects: scores.subjects,
        riskLevel: avgScore !== null && avgScore < 40 ? 'high' : avgScore !== null && avgScore < 55 ? 'medium' : 'low',
      };
    });

    // Class summary
    const classAvg = students.filter((s: any) => s.averageScore !== null);
    const overallAvg = classAvg.length > 0 ? classAvg.reduce((sum: number, s: any) => sum + (s.averageScore || 0), 0) / classAvg.length : null;

    res.json({
      className: cls.name,
      gradeLevel: cls.gradeLevel,
      term: cls.academicTerm?.name || null,
      totalStudents: cls.students.length,
      classAverage: overallAvg ? Number(overallAvg.toFixed(1)) : null,
      atRiskCount: students.filter((s: any) => s.riskLevel === 'high').length,
      students,
    });
  } catch (error) {
    console.error('Student insights error:', error);
    res.status(500).json({ error: 'Failed to load student insights' });
  }
};

// ==========================================
// AI Status Check
// ==========================================

export const getAIStatus = async (req: AuthRequest, res: Response) => {
  try {
    const isAvailable = await aiService.isAvailable();
    const settings = await prisma.schoolSettings.findFirst();

    res.json({
      available: isAvailable,
      provider: settings?.aiProvider || 'not configured',
      model: settings?.aiModel || 'not configured',
      enabled: settings?.aiEnabled || false,
    });
  } catch (error) {
    res.json({ available: false, provider: 'error', model: 'error', enabled: false });
  }
};

// ==========================================
// AI Report Card Remarks
// ==========================================

export const generateReportRemarks = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, termId } = req.body;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { class: true },
    });

    if (!student) return res.status(404).json({ error: 'Student not found' });

    const termResults = await prisma.termResult.findMany({
      where: { studentId, termId },
      include: { subject: true },
    });

    const attendance = await prisma.attendance.findMany({
      where: { studentId },
    });

    const totalRecords = attendance.length;
    const presentCount = attendance.filter((a: { status: string }) => a.status !== 'ABSENT').length;
    const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;

    const subjects = termResults.map((r: any) => ({
      name: r.subject.name,
      score: Number(r.totalScore),
      grade: r.grade || 'N/A',
    }));

    const avgScore = subjects.length > 0
      ? subjects.reduce((sum: number, s: { score: number }) => sum + s.score, 0) / subjects.length
      : 0;

    const prompt = `Generate a teacher's report card remark for this student:

Student: ${student.firstName} ${student.lastName}
Class: ${student.class.name}
Average Score: ${avgScore.toFixed(1)}%
Attendance Rate: ${attendanceRate}%
Subjects: ${subjects.map((s: { name: string; score: number; grade: string }) => `${s.name}: ${s.score}% (${s.grade})`).join(', ')}

Write TWO remarks:
1. Class Teacher's Remark (2-3 sentences, encouraging, specific to performance)
2. Principal's Remark (1-2 sentences, formal, forward-looking)

Consider this is a Zambian school. Be professional, encouraging, and specific.
Respond with JSON: { "classTeacherRemark": "...", "principalRemark": "..." }`;

    const startTime = Date.now();
    const remarks = await aiService.generateJSON<{
      classTeacherRemark: string;
      principalRemark: string;
    }>(prompt, {
      systemPrompt: 'You are an experienced Zambian school teacher writing report card remarks.',
      temperature: 0.6,
    });

    aiUsageTracker.track({
      userId: req.user?.userId || 'unknown',
      branchId: req.user?.branchId,
      feature: 'teaching-assistant',
      action: 'generate-remarks',
      responseTimeMs: Date.now() - startTime,
      metadata: { studentId, termId },
    });

    res.json(remarks);
  } catch (error: any) {
    console.error('Generate remarks error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate remarks' });
  }
};

// ==========================================
// Helpers
// ==========================================

async function getTeacherContext(userId: string): Promise<{
  classes: any[];
  subjects: any[];
  summary: string;
}> {
  try {
    // Get classes where user is class teacher
    const classTeacher = await prisma.class.findMany({
      where: { teacherId: userId },
      include: {
        subjects: { select: { id: true, name: true, code: true } },
        _count: { select: { students: true } },
        academicTerm: { select: { name: true, isActive: true } },
      },
    });

    // Get subjects assigned via TeacherSubject
    const teacherSubjects = await prisma.teacherSubject.findMany({
      where: { teacherId: userId },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        class: {
          select: { id: true, name: true, gradeLevel: true, _count: { select: { students: true } } },
        },
      },
    });

    // Build unique class list
    const classMap = new Map<string, any>();
    for (const c of classTeacher) {
      classMap.set(c.id, {
        id: c.id,
        name: c.name,
        gradeLevel: c.gradeLevel,
        studentCount: c._count.students,
        isClassTeacher: true,
        subjects: c.subjects.map((s: any) => s.name),
        term: c.academicTerm?.name,
      });
    }
    for (const ts of teacherSubjects) {
      if (!classMap.has(ts.classId)) {
        classMap.set(ts.classId, {
          id: ts.classId,
          name: ts.class.name,
          gradeLevel: ts.class.gradeLevel,
          studentCount: ts.class._count.students,
          isClassTeacher: false,
          subjects: [],
          term: null,
        });
      }
      const entry = classMap.get(ts.classId);
      if (!entry.subjects.includes(ts.subject.name)) {
        entry.subjects.push(ts.subject.name);
      }
    }

    const classes = Array.from(classMap.values());
    const allSubjects = teacherSubjects.map((ts: any) => ({
      id: ts.subject.id,
      name: ts.subject.name,
      code: ts.subject.code,
      classId: ts.classId,
      className: ts.class.name,
    }));

    // Fetch recent lesson plans for this teacher
    const recentPlans = await prisma.lessonPlan.findMany({
      where: { teacherId: userId },
      orderBy: { weekStartDate: 'desc' },
      take: 10,
      include: {
        subject: { select: { name: true, code: true } },
        class: { select: { name: true, gradeLevel: true } },
      },
    });

    // Build summary string for system prompt
    let summary = '';
    if (classes.length > 0) {
      summary = `\n\nYour teaching assignments:\n`;
      for (const c of classes) {
        summary += `- ${c.name} (Grade ${c.gradeLevel}, ${c.studentCount} students${c.isClassTeacher ? ', you are class teacher' : ''}): ${c.subjects.join(', ') || 'No subjects assigned'}\n`;
      }
    }

    if (recentPlans.length > 0) {
      summary += `\n\nYour recent lesson plans:\n`;
      for (const plan of recentPlans) {
        const date = new Date(plan.weekStartDate).toLocaleDateString();
        summary += `- [${date}] ${(plan as any).subject.name} / ${(plan as any).class.name}: ${plan.title}\n`;
      }
      summary += `(You have ${recentPlans.length} recent plans available. When asked about lesson plans, you can reference these.)\n`;
    }

    return { classes, subjects: allSubjects, summary };
  } catch (error) {
    console.error('Error loading teacher context:', error);
    return { classes: [], subjects: [], summary: '' };
  }
}

async function getClassInsights(classId: string): Promise<string> {
  try {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          where: { status: 'ACTIVE' },
          select: { id: true, firstName: true, lastName: true },
        },
        academicTerm: true,
      },
    });
    if (!cls) return '';

    const studentIds = cls.students.map((s: any) => s.id);

    // Get recent attendance stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const attendance = await prisma.attendance.findMany({
      where: {
        studentId: { in: studentIds },
        date: { gte: thirtyDaysAgo },
      },
    });

    const totalAttRecords = attendance.length;
    const presentCount = attendance.filter((a: any) => a.status === 'PRESENT').length;
    const lateCount = attendance.filter((a: any) => a.status === 'LATE').length;
    const absentCount = attendance.filter((a: any) => a.status === 'ABSENT').length;

    // Get term results if available
    const termResults = cls.academicTerm
      ? await prisma.termResult.findMany({
          where: { classId, termId: cls.academicTerm.id },
          include: { student: { select: { firstName: true, lastName: true } }, subject: { select: { name: true } } },
        })
      : [];

    let insights = `\n\nClass Data for ${cls.name}:\n`;
    insights += `- Students: ${cls.students.length} active\n`;
    insights += `- Attendance (last 30 days): ${totalAttRecords} records — ${presentCount} present, ${lateCount} late, ${absentCount} absent`;
    if (totalAttRecords > 0) {
      insights += ` (${Math.round((presentCount / totalAttRecords) * 100)}% attendance rate)`;
    }
    insights += '\n';

    if (termResults.length > 0) {
      // Compute per-subject averages
      const subjectScores: Record<string, { total: number; count: number }> = {};
      for (const r of termResults) {
        const subj = (r as any).subject.name;
        if (!subjectScores[subj]) subjectScores[subj] = { total: 0, count: 0 };
        subjectScores[subj].total += Number((r as any).totalScore);
        subjectScores[subj].count++;
      }
      insights += '- Subject averages: ';
      insights += Object.entries(subjectScores)
        .map(([name, data]) => `${name}: ${(data.total / data.count).toFixed(1)}%`)
        .join(', ');
      insights += '\n';

      // Find struggling students (avg < 40%)
      const studentScores: Record<string, { name: string; total: number; count: number }> = {};
      for (const r of termResults) {
        const sid = (r as any).studentId;
        if (!studentScores[sid]) {
          studentScores[sid] = {
            name: `${(r as any).student.firstName} ${(r as any).student.lastName}`,
            total: 0,
            count: 0,
          };
        }
        studentScores[sid].total += Number((r as any).totalScore);
        studentScores[sid].count++;
      }
      const struggling = Object.values(studentScores)
        .filter(s => s.total / s.count < 40)
        .map(s => `${s.name} (${(s.total / s.count).toFixed(0)}%)`);
      if (struggling.length > 0) {
        insights += `- Students needing support (avg < 40%): ${struggling.slice(0, 5).join(', ')}${struggling.length > 5 ? ` and ${struggling.length - 5} more` : ''}\n`;
      }
    }

    // Include recent lesson plans for this class
    const classLessonPlans = await prisma.lessonPlan.findMany({
      where: { classId },
      orderBy: { weekStartDate: 'desc' },
      take: 5,
      include: {
        subject: { select: { name: true, code: true } },
        teacher: { select: { fullName: true } },
      },
    });
    if (classLessonPlans.length > 0) {
      insights += `\nRecent lesson plans for this class:\n`;
      for (const plan of classLessonPlans) {
        const date = new Date(plan.weekStartDate).toLocaleDateString();
        insights += `  - [${date}] ${(plan as any).subject.name}: ${plan.title} (by ${(plan as any).teacher.fullName})\n`;
      }
    }

    return insights;
  } catch (error) {
    console.error('Error getting class insights:', error);
    return '';
  }
}

function buildSystemPrompt(context?: any, teacherSummary?: string, classInsights?: string): string {
  let prompt = `You are an AI Teaching Assistant for a Zambian school management system called Sync. You help teachers with:
- Creating lesson plans aligned to the Zambian curriculum
- Generating quizzes and assessments
- Writing professional emails to parents
- Providing teaching tips and strategies
- Creating rubrics and grading criteria
- Differentiating instruction for diverse learners
- Analyzing student performance and recommending interventions
- Referencing and building upon previously saved lesson plans

Be practical, culturally relevant to Zambia, and consider resource-limited classroom environments.
Format responses with clear headings, bullet points, numbered lists, and tables where appropriate.
Use markdown formatting (bold, headings, tables) to make responses easy to read.
When a teacher asks about lesson plans, reference their existing saved plans from the context below and offer to build upon them.`;

  if (context?.systemOverride) {
    prompt = context.systemOverride + '\n\n' + prompt;
  }

  // Inject teacher's real school data
  if (teacherSummary) {
    prompt += teacherSummary;
  }

  // Inject class-specific data when context specifies a class
  if (classInsights) {
    prompt += classInsights;
  }

  if (context?.subject) prompt += `\nCurrent Subject: ${context.subject}`;
  if (context?.gradeLevel) prompt += `\nCurrent Grade Level: ${context.gradeLevel}`;
  if (context?.className) prompt += `\nCurrent Class: ${context.className}`;

  return prompt;
}
