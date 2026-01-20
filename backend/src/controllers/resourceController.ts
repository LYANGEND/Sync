import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, getUserId } from '../utils/tenantContext';

const prisma = new PrismaClient() as any;

const createResourceSchema = z.object({
  classId: z.string(),
  subjectId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['PDF', 'VIDEO', 'DOCUMENT', 'LINK', 'IMAGE', 'PAST_PAPER', 'NOTES']),
  fileUrl: z.string().optional(),
  externalUrl: z.string().optional(),
  content: z.string().optional(),
  fileSize: z.number().optional(),
  duration: z.number().optional(),
  isDownloadable: z.boolean().default(true),
  topicId: z.string().optional(),
});

// Create resource (Teacher)
export const createResource = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const data = createResourceSchema.parse(req.body);

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

    // Create resource
    const resource = await prisma.resource.create({
      data: {
        subjectContentId: subjectContent.id,
        title: data.title,
        description: data.description,
        type: data.type,
        fileUrl: data.fileUrl,
        externalUrl: data.externalUrl,
        content: data.content,
        fileSize: data.fileSize,
        duration: data.duration,
        isDownloadable: data.isDownloadable,
        topicId: data.topicId,
      },
      include: {
        subjectContent: {
          include: {
            class: true,
            subject: true,
          }
        },
        topic: true,
      }
    });

    res.status(201).json(resource);
  } catch (error) {
    console.error('Create resource error:', error);
    res.status(500).json({ error: 'Failed to create resource' });
  }
};

// Get resources for teacher
export const getTeacherResources = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const { classId, subjectId, topicId } = req.query;

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

    if (topicId) {
      where.topicId = topicId as string;
    }

    const resources = await prisma.resource.findMany({
      where,
      include: {
        subjectContent: {
          include: {
            class: true,
            subject: true,
          }
        },
        topic: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(resources);
  } catch (error) {
    console.error('Get teacher resources error:', error);
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
};

// Get resources for student/parent
export const getStudentResources = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { studentId, subjectId, topicId } = req.query;

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

    const where: any = {
      subjectContent: {
        classId: student.classId,
      }
    };

    if (subjectId) {
      where.subjectContent.subjectId = subjectId as string;
    }

    if (topicId) {
      where.topicId = topicId as string;
    }

    const resources = await prisma.resource.findMany({
      where,
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
        topic: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(resources);
  } catch (error) {
    console.error('Get student resources error:', error);
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
};

// Delete resource (Teacher)
export const deleteResource = async (req: TenantRequest, res: Response) => {
  try {
    const { resourceId } = req.params;

    await prisma.resource.delete({
      where: { id: resourceId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete resource error:', error);
    res.status(500).json({ error: 'Failed to delete resource' });
  }
};
