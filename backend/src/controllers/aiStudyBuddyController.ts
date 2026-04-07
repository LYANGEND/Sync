import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import * as studyBuddyService from '../services/aiStudyBuddyService';

// ==========================================
// AI STUDY BUDDY CONTROLLER
// ==========================================
// Personal AI learning assistant for students

/**
 * POST /api/v1/ai-study-buddy/generate-practice-questions
 * Generate practice questions based on student's weak areas
 */
export const generatePracticeQuestions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { studentId, subjectId, topicId, count, difficulty } = req.body;

    if (!studentId || !subjectId) {
      return res.status(400).json({ 
        error: 'studentId and subjectId are required' 
      });
    }

    const questions = await studyBuddyService.generatePracticeQuestions(
      studentId,
      subjectId,
      topicId,
      count || 5,
      difficulty
    );

    res.json({
      success: true,
      count: questions.length,
      questions,
    });
  } catch (error: any) {
    console.error('Generate questions error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate practice questions' 
    });
  }
};

/**
 * POST /api/v1/ai-study-buddy/explain-concept
 * Explain a concept in simple terms with examples
 */
export const explainConcept = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { concept, subjectId, studentLevel, learningStyle } = req.body;

    if (!concept || !subjectId || !studentLevel) {
      return res.status(400).json({ 
        error: 'concept, subjectId, and studentLevel are required' 
      });
    }

    const explanation = await studyBuddyService.explainConcept(
      concept,
      subjectId,
      studentLevel,
      learningStyle
    );

    res.json({
      success: true,
      ...explanation,
    });
  } catch (error: any) {
    console.error('Explain concept error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to explain concept' 
    });
  }
};

/**
 * POST /api/v1/ai-study-buddy/create-study-plan
 * Create a personalized study plan for upcoming exams
 */
export const createStudyPlan = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { studentId, examDate, subjectIds } = req.body;

    if (!studentId || !examDate || !subjectIds || !Array.isArray(subjectIds)) {
      return res.status(400).json({ 
        error: 'studentId, examDate, and subjectIds (array) are required' 
      });
    }

    if (subjectIds.length === 0 || subjectIds.length > 10) {
      return res.status(400).json({ 
        error: 'subjectIds must contain 1-10 subjects' 
      });
    }

    const plan = await studyBuddyService.createStudyPlan(
      studentId,
      new Date(examDate),
      subjectIds
    );

    res.json({
      success: true,
      ...plan,
    });
  } catch (error: any) {
    console.error('Create study plan error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create study plan' 
    });
  }
};

/**
 * POST /api/v1/ai-study-buddy/summarize-notes
 * Summarize notes or content for easier revision
 */
export const summarizeNotes = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { content, targetLength, format } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    if (content.length < 50) {
      return res.status(400).json({ 
        error: 'Content too short to summarize (minimum 50 characters)' 
      });
    }

    const summary = await studyBuddyService.summarizeNotes(
      content,
      targetLength || 'medium',
      format || 'bullet_points'
    );

    res.json({
      success: true,
      summary,
      originalLength: content.length,
      summaryLength: summary.length,
      compressionRatio: Math.round((summary.length / content.length) * 100) + '%',
    });
  } catch (error: any) {
    console.error('Summarize notes error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to summarize notes' 
    });
  }
};

/**
 * GET /api/v1/ai-study-buddy/student-progress/:studentId
 * Get student's learning progress and recommendations
 */
export const getStudentProgress = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { studentId } = req.params;

    const { prisma } = await import('../utils/prisma');

    // Get recent activity
    const recentGrades = await prisma.studentGrade.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        subject: { select: { name: true } },
      },
    });

    // Calculate subject-wise performance
    const subjectPerformance = recentGrades.reduce((acc: any, grade: any) => {
      const subjectName = grade.subject.name;
      if (!acc[subjectName]) {
        acc[subjectName] = {
          subject: subjectName,
          scores: [],
          avgScore: 0,
          trend: 'stable',
        };
      }
      acc[subjectName].scores.push(Number(grade.score || 0));
      return acc;
    }, {});

    // Calculate averages and trends
    Object.keys(subjectPerformance).forEach(subject => {
      const scores = subjectPerformance[subject].scores;
      const avg = scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length;
      subjectPerformance[subject].avgScore = Math.round(avg);

      // Simple trend detection
      if (scores.length >= 3) {
        const recent = scores.slice(0, 2).reduce((sum: number, s: number) => sum + s, 0) / 2;
        const older = scores.slice(2).reduce((sum: number, s: number) => sum + s, 0) / (scores.length - 2);
        if (recent > older + 5) subjectPerformance[subject].trend = 'improving';
        else if (recent < older - 5) subjectPerformance[subject].trend = 'declining';
      }
    });

    res.json({
      studentId,
      recentGrades: recentGrades.slice(0, 5),
      subjectPerformance: Object.values(subjectPerformance),
      recommendations: {
        focusAreas: Object.values(subjectPerformance)
          .filter((s: any) => s.avgScore < 60)
          .map((s: any) => s.subject),
        strengths: Object.values(subjectPerformance)
          .filter((s: any) => s.avgScore >= 75)
          .map((s: any) => s.subject),
      },
    });
  } catch (error: any) {
    console.error('Get student progress error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get student progress' 
    });
  }
};
