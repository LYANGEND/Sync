import { Response } from 'express';
import { PrismaClient, TopicStatus } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, getUserId, handleControllerError } from '../utils/tenantContext';

const prisma = new PrismaClient();

// --- Schemas ---

const createTopicSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  subjectId: z.string().uuid(),
  gradeLevel: z.number().int().min(1).max(12),
  orderIndex: z.number().int().optional(),
});

const updateTopicProgressSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
});

const createLessonPlanSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  termId: z.string().uuid(),
  weekStartDate: z.string().datetime(),
  title: z.string().min(3),
  content: z.string().min(10),
  fileUrl: z.string().url().optional().or(z.literal('')),
});

// --- Topics (Syllabus) ---

export const getTopics = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { subjectId, gradeLevel } = req.query;

    if (!subjectId || !gradeLevel) {
      return res.status(400).json({ message: 'Subject ID and Grade Level are required' });
    }

    // Verify subject belongs to this tenant
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId as string, tenantId }
    });
    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const topics = await prisma.topic.findMany({
      where: {
        tenantId,
        subjectId: subjectId as string,
        gradeLevel: Number(gradeLevel),
      },
      orderBy: {
        orderIndex: 'asc',
      },
    });

    res.json(topics);
  } catch (error) {
    handleControllerError(res, error, 'getTopics');
  }
};

export const createTopic = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const data = createTopicSchema.parse(req.body);

    // Verify subject belongs to this tenant
    const subject = await prisma.subject.findFirst({
      where: { id: data.subjectId, tenantId }
    });
    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const topic = await prisma.topic.create({
      data: {
        tenantId,
        ...data
      },
    });

    res.status(201).json(topic);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    handleControllerError(res, error, 'createTopic');
  }
};

export const deleteTopic = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const existing = await prisma.topic.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    await prisma.topic.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    handleControllerError(res, error, 'deleteTopic');
  }
};

// --- Topic Progress ---

export const getClassProgress = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { classId, subjectId } = req.query;

    if (!classId || !subjectId) {
      return res.status(400).json({ message: 'Class ID and Subject ID are required' });
    }

    // 1. Get the class to know the grade level
    const classInfo = await prisma.class.findFirst({
      where: { id: classId as string, tenantId },
    });

    if (!classInfo) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // 2. Get all topics for this subject and grade
    const topics = await prisma.topic.findMany({
      where: {
        tenantId,
        subjectId: subjectId as string,
        gradeLevel: classInfo.gradeLevel,
      },
      orderBy: {
        orderIndex: 'asc',
      },
      include: {
        progress: {
          where: {
            classId: classId as string,
          },
        },
      },
    });

    // 3. Format response to include status directly
    const formattedTopics = topics.map(topic => ({
      ...topic,
      status: topic.progress[0]?.status || 'PENDING',
      completedAt: topic.progress[0]?.completedAt || null,
    }));

    res.json(formattedTopics);
  } catch (error) {
    handleControllerError(res, error, 'getClassProgress');
  }
};

export const updateTopicProgress = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { topicId, classId } = req.params;
    const { status } = updateTopicProgressSchema.parse(req.body);

    // Verify topic and class belong to this tenant
    const [topic, classData] = await Promise.all([
      prisma.topic.findFirst({ where: { id: topicId, tenantId } }),
      prisma.class.findFirst({ where: { id: classId, tenantId } }),
    ]);

    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    if (!classData) return res.status(404).json({ error: 'Class not found' });

    const progress = await prisma.topicProgress.upsert({
      where: {
        topicId_classId: {
          topicId,
          classId,
        },
      },
      update: {
        status: status as TopicStatus,
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
      create: {
        topicId,
        classId,
        status: status as TopicStatus,
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
    });

    res.json(progress);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    handleControllerError(res, error, 'updateTopicProgress');
  }
};

// --- Lesson Plans ---

export const getLessonPlans = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { classId, subjectId } = req.query;

    if (!classId || !subjectId) {
      return res.status(400).json({ message: 'Class ID and Subject ID are required' });
    }

    const plans = await prisma.lessonPlan.findMany({
      where: {
        tenantId,
        classId: classId as string,
        subjectId: subjectId as string,
      },
      orderBy: {
        weekStartDate: 'desc',
      },
      include: {
        teacher: {
          select: { fullName: true },
        },
      },
    });

    res.json(plans);
  } catch (error) {
    handleControllerError(res, error, 'getLessonPlans');
  }
};

export const createLessonPlan = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const data = createLessonPlanSchema.parse(req.body);

    // Verify references belong to this tenant
    const [classData, subject, term] = await Promise.all([
      prisma.class.findFirst({ where: { id: data.classId, tenantId } }),
      prisma.subject.findFirst({ where: { id: data.subjectId, tenantId } }),
      prisma.academicTerm.findFirst({ where: { id: data.termId, tenantId } }),
    ]);

    if (!classData) return res.status(404).json({ error: 'Class not found' });
    if (!subject) return res.status(404).json({ error: 'Subject not found' });
    if (!term) return res.status(404).json({ error: 'Term not found' });

    const plan = await prisma.lessonPlan.create({
      data: {
        tenantId,
        ...data,
        teacherId: userId,
      },
    });

    res.status(201).json(plan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    handleControllerError(res, error, 'createLessonPlan');
  }
};
