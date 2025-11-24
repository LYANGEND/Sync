import { Request, Response } from 'express';
import { PrismaClient, TopicStatus } from '@prisma/client';
import { z } from 'zod';

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
  weekStartDate: z.string().datetime(), // ISO Date string
  title: z.string().min(3),
  content: z.string().min(10),
  fileUrl: z.string().url().optional().or(z.literal('')),
});

// --- Topics (Syllabus) ---

export const getTopics = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { subjectId, gradeLevel } = req.query;

    if (!subjectId) {
      return res.status(400).json({ message: 'Subject ID is required' });
    }

    // Verify subject belongs to school
    const subject = await prisma.subject.findFirst({
      where: {
        id: subjectId as string,
        schoolId: req.school.id
      }
    });

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const topics = await prisma.topic.findMany({
      where: {
        subjectId: subjectId as string,
        gradeLevel: gradeLevel ? Number(gradeLevel) : undefined,
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



export const deleteTopic = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { id } = req.params;

    // Verify topic belongs to a subject in the school
    const topic = await prisma.topic.findFirst({
      where: {
        id,
        subject: {
          schoolId: req.school.id
        }
      }
    });

    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

    await prisma.topic.delete({
      where: { id },
    });

    res.json({ message: 'Topic deleted successfully' });
  } catch (error) {
    console.error('Delete topic error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// --- Topic Progress ---

export const getClassProgress = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { classId, subjectId } = req.query;

    if (!classId || !subjectId) {
      return res.status(400).json({ message: 'Class ID and Subject ID are required' });
    }

    // Verify class belongs to school
    const classExists = await prisma.class.findFirst({
      where: {
        id: classId as string,
        schoolId: req.school.id
      }
    });

    if (!classExists) {
      return res.status(404).json({ message: 'Class not found' });
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
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { topicId, classId } = req.params;
    const { status } = updateTopicProgressSchema.parse(req.body);

    // Verify class belongs to school
    const classExists = await prisma.class.findFirst({
      where: {
        id: classId,
        schoolId: req.school.id
      }
    });

    if (!classExists) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Verify topic belongs to a subject in the school
    const topic = await prisma.topic.findFirst({
      where: {
        id: topicId,
        subject: {
          schoolId: req.school.id
        }
      }
    });

    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

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
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { teacherId, classId, subjectId } = req.query;

    const where: any = {};
    if (teacherId) where.teacherId = teacherId as string;
    if (classId) where.classId = classId as string;
    if (subjectId) where.subjectId = subjectId as string;

    // Ensure we only fetch lesson plans for the current school
    where.class = {
        schoolId: req.school.id
    };

    const lessonPlans = await prisma.lessonPlan.findMany({
      where,
      include: {
        class: true,
        subject: true,
        teacher: {
          select: { fullName: true },
        },
      },
      orderBy: {
        weekStartDate: 'desc',
      },
    });

    res.json(lessonPlans);
  } catch (error) {
    console.error('Get lesson plans error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createLessonPlan = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const data = createLessonPlanSchema.parse(req.body);

    // Verify class belongs to school
    const classExists = await prisma.class.findFirst({
      where: {
        id: data.classId,
        schoolId: req.school.id
      }
    });

    if (!classExists) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const lessonPlan = await prisma.lessonPlan.create({
      data: {
        ...data,
        teacherId: (req as any).user?.userId, // Assuming teacher is creating it
      },
    });

    res.status(201).json(lessonPlan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Create lesson plan error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createTopic = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const data = createTopicSchema.parse(req.body);

    // Verify subject belongs to school
    const subject = await prisma.subject.findFirst({
      where: {
        id: data.subjectId,
        schoolId: req.school.id
      }
    });

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const topic = await prisma.topic.create({
      data: {
        subjectId: data.subjectId,
        title: data.title,
        description: data.description,
        gradeLevel: data.gradeLevel,
        orderIndex: data.orderIndex,
      },
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