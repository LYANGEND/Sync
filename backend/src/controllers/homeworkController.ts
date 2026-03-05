import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

// Get homework submissions for an assessment
export const getSubmissions = async (req: Request, res: Response) => {
  try {
    const { assessmentId } = req.params;

    const submissions = await prisma.homeworkSubmission.findMany({
      where: { assessmentId },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, admissionNumber: true }
        }
      },
      orderBy: { student: { lastName: 'asc' } },
    });

    res.json(submissions);
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
};

// Student submits homework
export const submitHomework = async (req: Request, res: Response) => {
  try {
    const { assessmentId } = req.params;
    const userId = (req as any).user?.userId;
    const { content, fileUrl } = req.body;

    // Get student record from user
    const student = await prisma.student.findFirst({ where: { userId } });
    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    // Check assessment exists and get due date
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const now = new Date();
    const isLate = assessment.dueDate ? now > assessment.dueDate : false;

    const submission = await prisma.homeworkSubmission.upsert({
      where: {
        assessmentId_studentId: { assessmentId, studentId: student.id }
      },
      update: {
        content,
        fileUrl,
        status: isLate ? 'LATE_SUBMITTED' : 'SUBMITTED',
        submittedAt: now,
        isLate,
      },
      create: {
        assessmentId,
        studentId: student.id,
        content,
        fileUrl,
        status: isLate ? 'LATE_SUBMITTED' : 'SUBMITTED',
        submittedAt: now,
        isLate,
      },
    });

    res.status(201).json(submission);
  } catch (error) {
    console.error('Submit homework error:', error);
    res.status(500).json({ error: 'Failed to submit homework' });
  }
};

// Teacher grades a homework submission
export const gradeSubmission = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const { score, feedback } = z.object({
      score: z.number().min(0),
      feedback: z.string().optional(),
    }).parse(req.body);

    const submission = await prisma.homeworkSubmission.update({
      where: { id },
      data: {
        score,
        feedback,
        status: 'GRADED',
        gradedAt: new Date(),
        gradedBy: userId,
      },
    });

    res.json(submission);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Grade submission error:', error);
    res.status(500).json({ error: 'Failed to grade submission' });
  }
};

// Get student's own submissions
export const getMySubmissions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    const student = await prisma.student.findFirst({ where: { userId } });
    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const submissions = await prisma.homeworkSubmission.findMany({
      where: { studentId: student.id },
      include: {
        assessment: {
          include: {
            subject: { select: { name: true, code: true } },
            class: { select: { name: true } },
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(submissions);
  } catch (error) {
    console.error('Get my submissions error:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
};
