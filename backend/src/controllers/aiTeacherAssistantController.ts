import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { AcademicScopeError, ensureAcademicClassAccess } from '../utils/academicScope';
import { isDateWithinRangeByDay } from '../utils/academicValidation';
import { runTermWriteTransaction, TermLifecycleError } from '../services/termLifecycleService';
import { sendTermLifecycleError } from '../utils/termLifecycleHttp';
import * as lessonPlannerService from '../services/aiLessonPlannerService';
import { prisma } from '../utils/prisma';

// ==========================================
// AI TEACHER ASSISTANT CONTROLLER
// ==========================================
// Endpoints for AI-powered teacher tools

/**
 * POST /api/v1/ai-teacher-assistant/generate-lesson-plan
 * Generate a comprehensive lesson plan from a topic
 */
export const generateLessonPlan = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { topicId, duration, classLevel, teachingStyle, includeAssessment, includeHomework } = req.body;

    // Validation
    if (!topicId || !duration || !classLevel) {
      return res.status(400).json({ 
        error: 'Missing required fields: topicId, duration, classLevel' 
      });
    }

    if (duration < 20 || duration > 180) {
      return res.status(400).json({ 
        error: 'Duration must be between 20 and 180 minutes' 
      });
    }

    // Generate lesson plan
    const lessonPlan = await lessonPlannerService.generateLessonPlan({
      topicId,
      duration: Number(duration),
      classLevel,
      teachingStyle: teachingStyle || 'interactive',
      includeAssessment: includeAssessment !== false,
      includeHomework: includeHomework !== false,
    });

    res.json(lessonPlan);
  } catch (error: any) {
    console.error('Lesson plan generation error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate lesson plan' 
    });
  }
};

/**
 * POST /api/v1/ai-teacher-assistant/generate-unit-plan
 * Generate a multi-week unit plan covering multiple topics
 */
export const generateUnitPlan = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { subjectId, topicIds, classLevel, totalWeeks } = req.body;

    if (!subjectId || !topicIds || !Array.isArray(topicIds) || !classLevel || !totalWeeks) {
      return res.status(400).json({ 
        error: 'Missing required fields: subjectId, topicIds (array), classLevel, totalWeeks' 
      });
    }

    if (topicIds.length === 0 || topicIds.length > 10) {
      return res.status(400).json({ 
        error: 'topicIds must contain 1-10 topics' 
      });
    }

    const unitPlan = await lessonPlannerService.generateUnitPlan(
      subjectId,
      topicIds,
      classLevel,
      Number(totalWeeks)
    );

    res.json(unitPlan);
  } catch (error: any) {
    console.error('Unit plan generation error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate unit plan' 
    });
  }
};

/**
 * POST /api/v1/ai-teacher-assistant/adapt-lesson-plan
 * Adapt an existing lesson plan for different requirements
 */
export const adaptLessonPlan = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { lessonPlanId, newClassLevel, newTeachingStyle, shortenTo, focusAreas } = req.body;

    if (!lessonPlanId) {
      return res.status(400).json({ error: 'lessonPlanId is required' });
    }

    const adapted = await lessonPlannerService.adaptLessonPlan(lessonPlanId, {
      newClassLevel,
      newTeachingStyle,
      shortenTo: shortenTo ? Number(shortenTo) : undefined,
      focusAreas: focusAreas || [],
    });

    res.json(adapted);
  } catch (error: any) {
    console.error('Lesson plan adaptation error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to adapt lesson plan' 
    });
  }
};

/**
 * POST /api/v1/ai-teacher-assistant/save-lesson-plan
 * Save a generated lesson plan to the database
 */
export const saveLessonPlan = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { 
      title, 
      content, 
      classId, 
      subjectId, 
      weekStartDate,
    } = req.body;

    if (!title || !content || !classId || !subjectId || !weekStartDate) {
      return res.status(400).json({ 
        error: 'Missing required fields: title, content, classId, subjectId, weekStartDate' 
      });
    }

    // Format content for storage
    const formattedContent = typeof content === 'string' 
      ? content 
      : JSON.stringify(content, null, 2);

    const classInfo = await ensureAcademicClassAccess(req, classId, { subjectId });
    if (!isDateWithinRangeByDay(
      weekStartDate,
      classInfo.academicTerm.startDate,
      classInfo.academicTerm.endDate,
    )) {
      return res.status(400).json({ error: 'Lesson plan week must begin within the class academic term' });
    }

    const lessonPlan = await runTermWriteTransaction(classInfo.academicTermId, 'SETUP', tx => (
      tx.lessonPlan.create({
        data: {
          title,
          content: formattedContent,
          classId,
          subjectId,
          termId: classInfo.academicTermId,
          teacherId: userId,
          weekStartDate: new Date(weekStartDate),
        },
        include: {
          class: { select: { name: true } },
          subject: { select: { name: true } },
        },
      })
    ));

    res.status(201).json(lessonPlan);
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Save lesson plan error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to save lesson plan' 
    });
  }
};

/**
 * GET /api/v1/ai-teacher-assistant/lesson-plan-templates
 * Get suggested lesson plan templates based on subject and class level
 */
export const getLessonPlanTemplates = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { subjectId, classLevel } = req.query;

    // Get recent AI-generated lesson plans as templates
    const templates = await prisma.lessonPlan.findMany({
      where: {
        subjectId: subjectId as string,
        metadata: {
          path: ['aiGenerated'],
          equals: true,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        content: true,
        weekStartDate: true,
        subject: { select: { name: true } },
        class: { select: { name: true, gradeLevel: true } },
        metadata: true,
      },
    });

    res.json(templates);
  } catch (error: any) {
    console.error('Get templates error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get lesson plan templates' 
    });
  }
};
