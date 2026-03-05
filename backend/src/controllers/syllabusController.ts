import { Request, Response } from 'express';
import { TopicStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

// --- Schemas ---

const createTopicSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  subjectId: z.string().uuid(),
  gradeLevel: z.number().int().min(-3).max(12), // Allow negative values for ECD (Baby, Middle, Reception)
  orderIndex: z.number().int().optional(),
});

const updateTopicProgressSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']),
});

const createLessonPlanSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  termId: z.string().uuid(),
  weekStartDate: z.string(), // Allow YYYY-MM-DD formatted strings
  title: z.string().min(3),
  content: z.string().min(10),
  fileUrl: z.string().url().optional().or(z.literal('')),
});

// --- Topics (Syllabus) ---

export const getTopics = async (req: Request, res: Response) => {
  try {
    const { subjectId, gradeLevel } = req.query;

    if (!subjectId || !gradeLevel) {
      return res.status(400).json({ message: 'Subject ID and Grade Level are required' });
    }

    const topics = await prisma.topic.findMany({
      where: {
        subjectId: subjectId as string,
        gradeLevel: Number(gradeLevel),
      },
      orderBy: {
        orderIndex: 'asc',
      },
    });

    res.json(topics);
  } catch (error) {
    console.error('Get topics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createTopic = async (req: Request, res: Response) => {
  try {
    const data = createTopicSchema.parse(req.body);

    const topic = await prisma.topic.create({
      data,
    });

    res.status(201).json(topic);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Create topic error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteTopic = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.topic.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Delete topic error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateTopic = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = createTopicSchema.partial().parse(req.body);

    const topic = await prisma.topic.update({
      where: { id },
      data,
    });

    res.json(topic);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Update topic error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// --- Topic Progress ---

export const getClassProgress = async (req: Request, res: Response) => {
  try {
    const { classId, subjectId } = req.query;

    if (!classId || !subjectId) {
      return res.status(400).json({ message: 'Class ID and Subject ID are required' });
    }

    // 1. Get the class to know the grade level
    const classInfo = await prisma.class.findUnique({
      where: { id: classId as string },
    });

    if (!classInfo) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // 2. Get all topics for this subject and grade
    const topics = await prisma.topic.findMany({
      where: {
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
    console.error('Get class progress error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateTopicProgress = async (req: Request, res: Response) => {
  try {
    const { topicId, classId } = req.params;
    const { status } = updateTopicProgressSchema.parse(req.body);

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
    console.error('Update topic progress error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// --- Lesson Plans ---

export const getLessonPlans = async (req: Request, res: Response) => {
  try {
    const { classId, subjectId } = req.query;

    if (!classId || !subjectId) {
      return res.status(400).json({ message: 'Class ID and Subject ID are required' });
    }

    const plans = await prisma.lessonPlan.findMany({
      where: {
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
    console.error('Get lesson plans error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createLessonPlan = async (req: Request, res: Response) => {
  try {
    const data = createLessonPlanSchema.parse(req.body);
    const userId = (req as any).user?.userId;

    const plan = await prisma.lessonPlan.create({
      data: {
        ...data,
        teacherId: userId,
      },
    });

    res.status(201).json(plan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Create lesson plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateLessonPlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = createLessonPlanSchema.partial().parse(req.body);

    const plan = await prisma.lessonPlan.update({
      where: { id },
      data,
    });

    res.json(plan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Update lesson plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteLessonPlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.lessonPlan.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Delete lesson plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
