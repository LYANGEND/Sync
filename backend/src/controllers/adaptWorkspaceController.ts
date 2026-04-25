import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { AdaptWorkspaceService } from '../services/adaptWorkspaceService';

/**
 * ADAPT WORKSPACE CONTROLLER
 * 
 * Endpoints for creating, editing, and deploying adapted lesson plans
 * that originate from approved AI reteach drafts.
 */

/**
 * 1. GET /api/v1/adapt-workspace/lessons
 * List all adapted lessons for the current teacher.
 */
export const getLessons = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const status = req.query.status as string;
    const where: any = { teacherId: userId };
    if (status) where.status = status;

    const lessons = await prisma.adaptedLesson.findMany({
      where,
      include: {
        class: { select: { name: true } },
        subTopic: { select: { title: true, topic: { select: { title: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ data: lessons });
  } catch (error) {
    console.error('[AdaptWorkspace] getLessons error:', error);
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
};

/**
 * 2. GET /api/v1/adapt-workspace/lessons/:id
 * Get a single lesson with full activity details + target students.
 */
export const getLesson = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const lesson = await prisma.adaptedLesson.findUnique({
      where: { id: req.params.id },
      include: {
        class: { select: { name: true } },
        subTopic: { select: { title: true, topic: { select: { title: true } } } },
      },
    });

    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (lesson.teacherId !== userId) return res.status(403).json({ error: 'Not your lesson' });

    // Also fetch target student details
    let targetStudents: any[] = [];
    if (lesson.targetStudentIds.length > 0) {
      targetStudents = await prisma.student.findMany({
        where: { id: { in: lesson.targetStudentIds } },
        select: { id: true, firstName: true, lastName: true, admissionNumber: true },
      });
    }

    res.json({ data: { ...lesson, targetStudents } });
  } catch (error) {
    console.error('[AdaptWorkspace] getLesson error:', error);
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
};

/**
 * 3. POST /api/v1/adapt-workspace/create-from-action
 * Create a new adapted lesson from an approved PendingTeacherAction.
 */
export const createFromAction = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { actionId } = req.body;
    if (!actionId) return res.status(400).json({ error: 'actionId required' });

    const lesson = await AdaptWorkspaceService.createFromAction({
      teacherId: userId,
      actionId,
    });

    res.status(201).json({ data: lesson });
  } catch (error: any) {
    console.error('[AdaptWorkspace] createFromAction error:', error);
    res.status(400).json({ error: error.message || 'Failed to create lesson' });
  }
};

/**
 * 4. PUT /api/v1/adapt-workspace/lessons/:id
 * Update a lesson — edit title, objective, activities, target students, schedule.
 */
export const updateLesson = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const lesson = await AdaptWorkspaceService.updateLesson(
      req.params.id,
      userId,
      req.body,
    );

    res.json({ data: lesson });
  } catch (error: any) {
    console.error('[AdaptWorkspace] updateLesson error:', error);
    res.status(400).json({ error: error.message || 'Failed to update lesson' });
  }
};

/**
 * 5. POST /api/v1/adapt-workspace/lessons/:id/generate-activities
 * AI-generate differentiated activities for an existing lesson.
 */
export const generateActivities = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Verify ownership
    const existing = await prisma.adaptedLesson.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Lesson not found' });
    if (existing.teacherId !== userId) return res.status(403).json({ error: 'Not your lesson' });

    const lesson = await AdaptWorkspaceService.generateActivities({
      lessonId: req.params.id,
      additionalContext: req.body.additionalContext,
    });

    res.json({ data: lesson });
  } catch (error: any) {
    console.error('[AdaptWorkspace] generateActivities error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate activities' });
  }
};

/**
 * 6. PATCH /api/v1/adapt-workspace/lessons/:id/status
 * Transition lesson status: DRAFT → READY → DEPLOYED → COMPLETED
 */
export const changeLessonStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });

    const lesson = await AdaptWorkspaceService.changeStatus(
      req.params.id,
      userId,
      status,
    );

    res.json({ data: lesson });
  } catch (error: any) {
    console.error('[AdaptWorkspace] changeLessonStatus error:', error);
    res.status(400).json({ error: error.message || 'Failed to change status' });
  }
};
