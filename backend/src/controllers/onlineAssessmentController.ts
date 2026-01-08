import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId } from '../utils/tenantContext';

const prisma = new PrismaClient() as any;

// Schema for creating/updating questions
const questionSchema = z.object({
  text: z.string().min(1),
  type: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY']),
  points: z.number().min(1),
  correctAnswer: z.string().optional(),
  options: z.array(z.object({
    text: z.string(),
    isCorrect: z.boolean()
  })).optional()
});

export const addQuestionsToAssessment = async (req: TenantRequest, res: Response) => {
  try {
    const { assessmentId } = req.params;
    const { questions } = req.body;
    const tenantId = getTenantId(req);

    // Validate assessment exists and belongs to tenant
    const assessment = await prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        tenantId
      }
    });

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    // Create questions in transaction
    await prisma.$transaction(async (tx: any) => {
      for (const q of questions) {
        const questionData = questionSchema.parse(q);

        const createdQuestion = await tx.question.create({
          data: {
            assessmentId,
            text: questionData.text,
            type: questionData.type,
            points: questionData.points,
            correctAnswer: questionData.correctAnswer,
          }
        });

        if (questionData.options && questionData.options.length > 0) {
          await tx.questionOption.createMany({
            data: questionData.options.map(opt => ({
              questionId: createdQuestion.id,
              text: opt.text,
              isCorrect: opt.isCorrect
            }))
          });
        }
      }
    });

    // Enable online mode for assessment
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { isOnline: true }
    });

    res.json({ message: 'Questions added successfully' });
  } catch (error) {
    console.error('Add questions error:', error);
    res.status(500).json({ error: 'Failed to add questions' });
  }
};

export const getAssessmentQuestions = async (req: TenantRequest, res: Response) => {
  try {
    const { assessmentId } = req.params;
    const tenantId = getTenantId(req);

    // Verify assessment belongs to tenant
    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, tenantId }
    });

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    // Check if user is student or teacher
    // If student, don't return correct answers or isCorrect flags
    // For now, assuming teacher view or internal logic handles it
    // But wait, if this is for taking the quiz, we must hide answers.

    const questions = await prisma.question.findMany({
      where: { assessmentId },
      include: {
        options: {
          select: {
            id: true,
            text: true,
            // Only include isCorrect if teacher? 
            // For simplicity, let's make a separate endpoint for taking the quiz
          }
        }
      }
    });

    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
};

// For Students taking the quiz
export const getQuizForStudent = async (req: TenantRequest, res: Response) => {
  try {
    const { assessmentId } = req.params;
    const tenantId = getTenantId(req);

    const assessment = await prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        tenantId
      },
      include: {
        questions: {
          include: {
            options: {
              select: {
                id: true,
                text: true
              }
            }
          }
        }
      }
    });

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    // Remove sensitive data
    const sanitizedQuestions = assessment.questions.map((q: any) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      points: q.points,
      options: q.options
    }));

    res.json({
      id: assessment.id,
      title: assessment.title,
      durationMinutes: assessment.durationMinutes,
      questions: sanitizedQuestions
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to load quiz' });
  }
};

export const submitQuiz = async (req: TenantRequest, res: Response) => {
  try {
    const { assessmentId } = req.params;
    const { studentId, responses } = req.body; // responses: { questionId: string, answer: string | optionId }[]
    const tenantId = getTenantId(req);

    // Verify assessment belongs to tenant
    const assessmentExists = await prisma.assessment.findFirst({
      where: { id: assessmentId, tenantId }
    });

    if (!assessmentExists) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    // If studentId is a User ID (from frontend auth), find the actual Student ID
    let actualStudentId = studentId;

    // Check if this ID looks like a User ID (UUID) and try to find a student linked to it
    // Or just try to find a student with this userId
    const studentProfile = await prisma.student.findFirst({
      where: { userId: studentId, tenantId }
    });

    if (studentProfile) {
      actualStudentId = studentProfile.id;
    }

    // Start transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Create Submission
      const submission = await tx.assessmentSubmission.create({
        data: {
          assessmentId,
          studentId: actualStudentId,
          submittedAt: new Date(),
          status: 'SUBMITTED'
        }
      });

      // 2. Record Responses
      let totalScore = 0;

      for (const resp of responses) {
        const question = await tx.question.findUnique({
          where: { id: resp.questionId },
          include: { options: true }
        });

        if (!question) continue;

        let isCorrect = false;
        let score = 0;

        if (question.type === 'MULTIPLE_CHOICE' || question.type === 'TRUE_FALSE') {
          const selectedOption = question.options.find((o: any) => o.id === resp.answer);
          if (selectedOption && selectedOption.isCorrect) {
            isCorrect = true;
            score = question.points;
          }

          await tx.studentResponse.create({
            data: {
              submissionId: submission.id,
              questionId: question.id,
              selectedOptionId: resp.answer
            }
          });
        } else {
          // Manual grading needed for others
          await tx.studentResponse.create({
            data: {
              submissionId: submission.id,
              questionId: question.id,
              answerText: resp.answer
            }
          });
        }

        totalScore += score;
      }

      // Update submission score (auto-graded part)
      await tx.assessmentSubmission.update({
        where: { id: submission.id },
        data: { score: totalScore }
      });

      return { submissionId: submission.id, score: totalScore };
    });

    res.json(result);

  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
};

export const getStudentAssessments = async (req: TenantRequest, res: Response) => {
  try {
    const user = (req as any).user;
    const tenantId = getTenantId(req);

    // Determine which student to fetch for
    let student;

    if (user.role === 'PARENT') {
      const targetStudentId = req.query.studentId as string;
      if (!targetStudentId) {
        return res.status(400).json({ error: 'Student ID is required when accessing as parent' });
      }

      // Verify ownership
      student = await prisma.student.findFirst({
        where: { id: targetStudentId, tenantId }
      });

      if (!student || student.parentId !== user.userId) {
        return res.status(403).json({ error: 'Unauthorized: You are not the guardian of this student' });
      }

    } else {
      // Regular Student Access
      const userId = user.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      student = await prisma.student.findFirst({
        where: { userId, tenantId }
      });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    // Get assessments for student's class
    const assessments = await prisma.assessment.findMany({
      where: {
        classId: student.classId,
        // Optional: Filter by active term
      },
      include: {
        subject: true,
        submissions: {
          where: { studentId: student.id },
          take: 1
        }
      },
      orderBy: { date: 'desc' }
    });

    // Format response
    const formattedAssessments = assessments.map((a: any) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      date: a.date,
      subject: { name: a.subject.name },
      durationMinutes: a.durationMinutes,
      isOnline: a.isOnline,
      submission: a.submissions[0] ? {
        status: a.submissions[0].status,
        score: a.submissions[0].score
      } : null
    }));

    res.json(formattedAssessments);

  } catch (error) {
    console.error('Get student assessments error:', error);
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
};
