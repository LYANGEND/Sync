import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { TeachingHubService } from '../services/teachingHubService';

/**
 * 1. GET /api/v1/teaching-hub/learning-objectives
 * Gets the "Heatmap" data for a specific class or across all a teacher's classes.
 */
export const getLearningObjectives = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const classId = req.query.classId as string;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Build the where clause
    const whereClause: any = {};
    if (classId) {
      whereClause.classId = classId;
      // Ensure the class belongs to the teacher
      const classData = await prisma.class.findUnique({ where: { id: classId } });
      if (classData?.teacherId !== userId) {
        return res.status(403).json({ error: 'Not authorized for this class' });
      }
    } else {
      // Find all classes for this teacher
      const myClasses = await prisma.class.findMany({
        where: { teacherId: userId },
        select: { id: true },
      });
      whereClause.classId = { in: myClasses.map(c => c.id) };
    }

    // Only get class-level aggregates (where studentId is null) or just all records to aggregate on frontend
    const objectives = await prisma.learningObjectiveMastery.findMany({
      where: whereClause,
      include: {
        subTopic: {
          select: {
            title: true,
            topic: {
              select: { title: true }
            }
          }
        },
        student: {
          select: { firstName: true, lastName: true }
        }
      },
      orderBy: {
        masteryScore: 'asc' // Show lowest mastery first for urgent attention
      }
    });

    res.json({ data: objectives });
  } catch (error) {
    console.error('[TeachingHub] getLearningObjectives error:', error);
    res.status(500).json({ error: 'Failed to fetch learning objectives' });
  }
};

/**
 * 2. GET /api/v1/teaching-hub/student-queue
 * Ranked list of students needing help today based on "URGENT" mastery and attendance
 */
export const getStudentQueue = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Get classes for this teacher
    const myClasses = await prisma.class.findMany({
      where: { teacherId: userId },
      select: { id: true },
    });

    const classIds = myClasses.map(c => c.id);

    // Find students who have URGENT or FRAGILE mastery records
    const strugglingRecords = await prisma.learningObjectiveMastery.findMany({
      where: {
        classId: { in: classIds },
        studentId: { not: null },
        status: { in: ['URGENT', 'FRAGILE'] }
      },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true }
        },
        class: {
          select: { id: true, name: true }
        },
        subTopic: {
          select: { title: true }
        }
      }
    });

    // We can group by student returning a ranked queue
    const queueMap = new Map<string, any>();
    
    strugglingRecords.forEach(record => {
      if (!record.studentId || !record.student) return;
      
      if (!queueMap.has(record.studentId)) {
        queueMap.set(record.studentId, {
          studentId: record.studentId,
          name: `${record.student.firstName} ${record.student.lastName}`,
          className: record.class.name,
          urgentCount: 0,
          fragileCount: 0,
          weakTopics: [] as string[]
        });
      }

      const entry = queueMap.get(record.studentId);
      if (record.status === 'URGENT') entry.urgentCount++;
      if (record.status === 'FRAGILE') entry.fragileCount++;
      entry.weakTopics.push(record.subTopic.title);
    });

    const studentQueue = Array.from(queueMap.values()).sort((a, b) => b.urgentCount - a.urgentCount);

    res.json({ data: studentQueue });
  } catch (error) {
    console.error('[TeachingHub] getStudentQueue error:', error);
    res.status(500).json({ error: 'Failed to fetch student queue' });
  }
};

/**
 * 3. GET /api/v1/teaching-hub/pending-actions
 * AI-drafted reteach plans and parent updates awaiting approval
 */
export const getPendingActions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const pendingActions = await prisma.pendingTeacherAction.findMany({
      where: {
        teacherId: userId,
        status: 'PENDING'
      },
      include: {
        class: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ data: pendingActions });
  } catch (error) {
    console.error('[TeachingHub] getPendingActions error:', error);
    res.status(500).json({ error: 'Failed to fetch pending actions' });
  }
};

/**
 * 4. POST /api/v1/teaching-hub/resolve-action
 * Teacher approves, edits, or dismisses an AI-drafted action.
 */
export const resolveAction = async (req: Request, res: Response) => {
  try {
    const { actionId, status } = req.body;
    if (!actionId || !status) return res.status(400).json({ error: 'actionId and status required' });

    const updated = await TeachingHubService.resolvePendingAction(actionId, status);
    res.json({ data: updated });
  } catch (error) {
    console.error('[TeachingHub] resolveAction error:', error);
    res.status(500).json({ error: 'Failed to resolve action' });
  }
};

/**
 * 5. POST /api/v1/teaching-hub/log-intervention
 * Teacher logs an intervention for effectiveness tracking.
 */
export const logIntervention = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { classId, subTopicId, studentIds, strategyUsed, notes, preScore } = req.body;
    if (!classId || !subTopicId || !strategyUsed) {
      return res.status(400).json({ error: 'classId, subTopicId, and strategyUsed required' });
    }

    const intervention = await TeachingHubService.logIntervention({
      teacherId: userId,
      classId,
      subTopicId,
      studentIds: studentIds || [],
      strategyUsed,
      notes,
      preScore
    });

    res.status(201).json({ data: intervention });
  } catch (error) {
    console.error('[TeachingHub] logIntervention error:', error);
    res.status(500).json({ error: 'Failed to log intervention' });
  }
};
