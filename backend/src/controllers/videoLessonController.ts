import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Validation schemas
const createVideoSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  topicId: z.string().uuid().optional(),
  subjectId: z.string().uuid(),
  gradeLevel: z.number().int().min(1).max(12),
  videoUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  duration: z.number().int().min(1),
  transcript: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * Upload/Create a new video lesson
 */
export const createVideoLesson = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const data = createVideoSchema.parse(req.body);

    const video = await prisma.videoLesson.create({
      data: {
        ...data,
        uploadedBy: userId,
        isPublished: false, // Draft by default
      },
      include: {
        subject: true,
        topic: true,
        teacher: {
          select: {
            fullName: true,
          },
        },
      },
    });

    res.status(201).json(video);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Create video error:', error);
    res.status(500).json({ error: 'Failed to create video lesson' });
  }
};

/**
 * Get video lessons (with filters)
 */
export const getVideoLessons = async (req: Request, res: Response) => {
  try {
    const { subjectId, gradeLevel, topicId, search, published } = req.query;

    const where: any = {};

    if (subjectId) {
      where.subjectId = subjectId as string;
    }

    if (gradeLevel) {
      where.gradeLevel = parseInt(gradeLevel as string);
    }

    if (topicId) {
      where.topicId = topicId as string;
    }

    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        { tags: { has: search as string } },
      ];
    }

    if (published !== undefined) {
      where.isPublished = published === 'true';
    }

    const videos = await prisma.videoLesson.findMany({
      where,
      include: {
        subject: true,
        topic: true,
        teacher: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(videos);
  } catch (error) {
    console.error('Get videos error:', error);
    res.status(500).json({ error: 'Failed to fetch video lessons' });
  }
};

/**
 * Get single video lesson with progress
 */
export const getVideoLesson = async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;
    const userId = (req as any).user?.userId;

    const video = await prisma.videoLesson.findUnique({
      where: { id: videoId },
      include: {
        subject: true,
        topic: true,
        teacher: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Get student's progress if they're a student
    let progress = null;
    const student = await prisma.student.findUnique({
      where: { userId },
    });

    if (student) {
      progress = await prisma.videoProgress.findUnique({
        where: {
          videoId_studentId: {
            videoId,
            studentId: student.id,
          },
        },
      });
    }

    // Increment view count
    await prisma.videoLesson.update({
      where: { id: videoId },
      data: {
        viewCount: {
          increment: 1,
        },
      },
    });

    res.json({
      ...video,
      progress: progress || null,
    });
  } catch (error) {
    console.error('Get video error:', error);
    res.status(500).json({ error: 'Failed to fetch video lesson' });
  }
};

/**
 * Update video progress
 */
export const updateVideoProgress = async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;
    const userId = (req as any).user?.userId;
    const { watchedSeconds, lastPosition, completed } = req.body;

    // Find student profile
    const student = await prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    // Verify video exists
    const video = await prisma.videoLesson.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Update or create progress
    const progress = await prisma.videoProgress.upsert({
      where: {
        videoId_studentId: {
          videoId,
          studentId: student.id,
        },
      },
      update: {
        watchedSeconds: Math.max(watchedSeconds || 0, 0),
        lastPosition: lastPosition || 0,
        completed: completed || false,
      },
      create: {
        videoId,
        studentId: student.id,
        watchedSeconds: watchedSeconds || 0,
        lastPosition: lastPosition || 0,
        completed: completed || false,
      },
    });

    res.json(progress);
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
};

/**
 * Publish/unpublish video
 */
export const togglePublishVideo = async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;
    const userId = (req as any).user?.userId;

    const video = await prisma.videoLesson.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Only uploader can publish/unpublish
    if (video.uploadedBy !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updatedVideo = await prisma.videoLesson.update({
      where: { id: videoId },
      data: {
        isPublished: !video.isPublished,
        publishedAt: !video.isPublished ? new Date() : null,
      },
    });

    res.json(updatedVideo);
  } catch (error) {
    console.error('Toggle publish error:', error);
    res.status(500).json({ error: 'Failed to update video' });
  }
};

/**
 * Delete video lesson
 */
export const deleteVideoLesson = async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;
    const userId = (req as any).user?.userId;

    const video = await prisma.videoLesson.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Only uploader can delete
    if (video.uploadedBy !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.videoLesson.delete({
      where: { id: videoId },
    });

    // TODO: Delete video file from storage (S3/Azure Blob)

    res.status(204).send();
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
};

/**
 * Get student's video library with progress
 */
export const getMyVideoLibrary = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    const student = await prisma.student.findUnique({
      where: { userId },
      include: { class: true },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    // Get videos for student's grade level
    const videos = await prisma.videoLesson.findMany({
      where: {
        gradeLevel: student.class.gradeLevel,
        isPublished: true,
      },
      include: {
        subject: true,
        topic: true,
        teacher: {
          select: {
            fullName: true,
          },
        },
        progress: {
          where: {
            studentId: student.id,
          },
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
    });

    // Format response with progress
    const formattedVideos = videos.map((video) => ({
      ...video,
      progress: video.progress[0] || null,
    }));

    res.json(formattedVideos);
  } catch (error) {
    console.error('Get video library error:', error);
    res.status(500).json({ error: 'Failed to fetch video library' });
  }
};

/**
 * Get video analytics
 */
export const getVideoAnalytics = async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;

    const video = await prisma.videoLesson.findUnique({
      where: { id: videoId },
      include: {
        progress: {
          include: {
            student: {
              select: {
                firstName: true,
                lastName: true,
                class: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const totalViews = video.viewCount;
    const uniqueViewers = video.progress.length;
    const completedCount = video.progress.filter((p) => p.completed).length;
    const completionRate =
      uniqueViewers > 0 ? (completedCount / uniqueViewers) * 100 : 0;

    const avgWatchTime =
      video.progress.length > 0
        ? video.progress.reduce((sum, p) => sum + p.watchedSeconds, 0) /
          video.progress.length
        : 0;

    const avgCompletionPercentage =
      video.progress.length > 0
        ? video.progress.reduce(
            (sum, p) => sum + (p.watchedSeconds / video.duration) * 100,
            0
          ) / video.progress.length
        : 0;

    const analytics = {
      videoId: video.id,
      title: video.title,
      duration: video.duration,
      totalViews,
      uniqueViewers,
      completedCount,
      completionRate: Math.round(completionRate),
      avgWatchTime: Math.round(avgWatchTime),
      avgCompletionPercentage: Math.round(avgCompletionPercentage),
      viewerDetails: video.progress.map((p) => ({
        student: `${p.student.firstName} ${p.student.lastName}`,
        class: p.student.class.name,
        watchedSeconds: p.watchedSeconds,
        completed: p.completed,
        lastWatched: p.lastWatched,
      })),
    };

    res.json(analytics);
  } catch (error) {
    console.error('Get video analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

/**
 * Search videos
 */
export const searchVideos = async (req: Request, res: Response) => {
  try {
    const { q, subjectId, gradeLevel } = req.query;

    if (!q || (q as string).length < 2) {
      return res.json([]);
    }

    const where: any = {
      isPublished: true,
      OR: [
        { title: { contains: q as string, mode: 'insensitive' } },
        { description: { contains: q as string, mode: 'insensitive' } },
        { tags: { has: q as string } },
      ],
    };

    if (subjectId) {
      where.subjectId = subjectId;
    }

    if (gradeLevel) {
      where.gradeLevel = parseInt(gradeLevel as string);
    }

    const videos = await prisma.videoLesson.findMany({
      where,
      include: {
        subject: true,
        topic: true,
        teacher: {
          select: {
            fullName: true,
          },
        },
      },
      take: 20,
    });

    res.json(videos);
  } catch (error) {
    console.error('Search videos error:', error);
    res.status(500).json({ error: 'Failed to search videos' });
  }
};
