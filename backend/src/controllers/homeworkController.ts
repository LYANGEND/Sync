import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, getUserId, getUserRole } from '../utils/tenantContext';

const prisma = new PrismaClient() as any;

// Validation schemas
const createHomeworkSchema = z.object({
  classId: z.string(),
  subjectId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().optional(),
  type: z.enum(['CLASSWORK', 'HOMEWORK', 'PROJECT', 'RESEARCH', 'PRACTICE']).default('HOMEWORK'),
  dueDate: z.string().optional(),
  maxPoints: z.number().optional(),
  requiresSubmission: z.boolean().default(false),
  allowLateSubmission: z.boolean().default(true),
  attachments: z.array(z.string()).default([]),
  topicId: z.string().optional(),
});

const submitHomeworkSchema = z.object({
  content: z.string().optional(),
  attachments: z.array(z.string()).default([]),
  status: z.enum(['DRAFT', 'SUBMITTED']).default('SUBMITTED'),
});

const gradeHomeworkSchema = z.object({
  marks: z.number(),
  maxMarks: z.number(),
  feedback: z.string().optional(),
});

// Create homework (Teacher)
export const createHomework = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const data = createHomeworkSchema.parse(req.body);

    // Get or create subject content
    const currentTerm = await prisma.academicTerm.findFirst({
      where: { tenantId, isActive: true }
    });

    if (!currentTerm) {
      return res.status(400).json({ error: 'No active academic term found' });
    }

    let subjectContent = await prisma.subjectContent.findFirst({
      where: {
        classId: data.classId,
        subjectId: data.subjectId,
        academicTermId: currentTerm.id,
      }
    });

    if (!subjectContent) {
      subjectContent = await prisma.subjectContent.create({
        data: {
          tenantId,
          classId: data.classId,
          subjectId: data.subjectId,
          academicTermId: currentTerm.id,
          teacherId,
        }
      });
    }

    // Create homework
    const homework = await prisma.homework.create({
      data: {
        subjectContentId: subjectContent.id,
        title: data.title,
        description: data.description,
        instructions: data.instructions,
        type: data.type,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        maxPoints: data.maxPoints,
        requiresSubmission: data.requiresSubmission,
        allowLateSubmission: data.allowLateSubmission,
        attachments: data.attachments,
        topicId: data.topicId,
      },
      include: {
        subjectContent: {
          include: {
            class: true,
            subject: true,
          }
        }
      }
    });

    res.status(201).json(homework);
  } catch (error) {
    console.error('Create homework error:', error);
    res.status(500).json({ error: 'Failed to create homework' });
  }
};

// Get homework for teacher (by class)
export const getTeacherHomework = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const { classId, subjectId } = req.query;

    const where: any = {
      subjectContent: {
        tenantId,
        teacherId,
      }
    };

    if (classId) {
      where.subjectContent.classId = classId as string;
    }

    if (subjectId) {
      where.subjectContent.subjectId = subjectId as string;
    }

    const homework = await prisma.homework.findMany({
      where,
      include: {
        subjectContent: {
          include: {
            class: true,
            subject: true,
          }
        },
        submissions: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              }
            }
          }
        },
        _count: {
          select: {
            submissions: true,
          }
        }
      },
      orderBy: { dueDate: 'desc' }
    });

    res.json(homework);
  } catch (error) {
    console.error('Get teacher homework error:', error);
    res.status(500).json({ error: 'Failed to fetch homework' });
  }
};

// Get homework for student/parent
export const getStudentHomework = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { studentId } = req.query;

    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    // Verify student belongs to tenant
    const student = await prisma.student.findFirst({
      where: { id: studentId as string, tenantId }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get homework for student's class
    const homework = await prisma.homework.findMany({
      where: {
        subjectContent: {
          classId: student.classId,
        }
      },
      include: {
        subjectContent: {
          include: {
            subject: true,
            teacher: {
              select: {
                id: true,
                fullName: true,
              }
            }
          }
        },
        submissions: {
          where: {
            studentId: studentId as string,
          }
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    res.json(homework);
  } catch (error) {
    console.error('Get student homework error:', error);
    res.status(500).json({ error: 'Failed to fetch homework' });
  }
};

// Submit homework (Student/Parent)
export const submitHomework = async (req: TenantRequest, res: Response) => {
  try {
    const { homeworkId } = req.params;
    const { studentId } = req.query;
    const data = submitHomeworkSchema.parse(req.body);

    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    // Check if homework exists
    const homework = await prisma.homework.findUnique({
      where: { id: homeworkId }
    });

    if (!homework) {
      return res.status(404).json({ error: 'Homework not found' });
    }

    // Check if late
    const isLate = homework.dueDate ? new Date() > homework.dueDate : false;

    if (isLate && !homework.allowLateSubmission) {
      return res.status(400).json({ error: 'Late submissions not allowed' });
    }

    // Create or update submission
    const submission = await prisma.homeworkSubmission.upsert({
      where: {
        homeworkId_studentId: {
          homeworkId,
          studentId: studentId as string,
        }
      },
      create: {
        homeworkId,
        studentId: studentId as string,
        content: data.content,
        attachments: data.attachments,
        status: data.status,
        isLate,
      },
      update: {
        content: data.content,
        attachments: data.attachments,
        status: data.status,
        submittedAt: data.status === 'SUBMITTED' ? new Date() : undefined,
      }
    });

    res.json(submission);
  } catch (error) {
    console.error('Submit homework error:', error);
    res.status(500).json({ error: 'Failed to submit homework' });
  }
};

// Grade homework (Teacher)
export const gradeHomework = async (req: TenantRequest, res: Response) => {
  try {
    const { submissionId } = req.params;
    const teacherId = getUserId(req);
    const data = gradeHomeworkSchema.parse(req.body);

    const submission = await prisma.homeworkSubmission.update({
      where: { id: submissionId },
      data: {
        marks: data.marks,
        maxMarks: data.maxMarks,
        feedback: data.feedback,
        gradedAt: new Date(),
        gradedByUserId: teacherId,
        status: 'GRADED',
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          }
        },
        homework: {
          include: {
            subjectContent: {
              include: {
                subject: true,
              }
            }
          }
        }
      }
    });

    res.json(submission);
  } catch (error) {
    console.error('Grade homework error:', error);
    res.status(500).json({ error: 'Failed to grade homework' });
  }
};

// Bulk grade homework (Teacher)
export const bulkGradeHomework = async (req: TenantRequest, res: Response) => {
  try {
    const teacherId = getUserId(req);
    const { grades } = req.body; // Array of { submissionId, marks, maxMarks, feedback }

    if (!Array.isArray(grades)) {
      return res.status(400).json({ error: 'Grades must be an array' });
    }

    const results = await Promise.all(
      grades.map(async (grade: any) => {
        return prisma.homeworkSubmission.update({
          where: { id: grade.submissionId },
          data: {
            marks: grade.marks,
            maxMarks: grade.maxMarks,
            feedback: grade.feedback,
            gradedAt: new Date(),
            gradedByUserId: teacherId,
            status: 'GRADED',
          }
        });
      })
    );

    res.json({ success: true, graded: results.length });
  } catch (error) {
    console.error('Bulk grade homework error:', error);
    res.status(500).json({ error: 'Failed to grade homework' });
  }
};

// Get homework submissions (Teacher)
export const getHomeworkSubmissions = async (req: TenantRequest, res: Response) => {
  try {
    const { homeworkId } = req.params;

    const submissions = await prisma.homeworkSubmission.findMany({
      where: { homeworkId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
          }
        },
        gradedBy: {
          select: {
            id: true,
            fullName: true,
          }
        }
      },
      orderBy: { submittedAt: 'desc' }
    });

    res.json(submissions);
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
};

// Delete homework (Teacher)
export const deleteHomework = async (req: TenantRequest, res: Response) => {
  try {
    const { homeworkId } = req.params;

    await prisma.homework.delete({
      where: { id: homeworkId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete homework error:', error);
    res.status(500).json({ error: 'Failed to delete homework' });
  }
};
