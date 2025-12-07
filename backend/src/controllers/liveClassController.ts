import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

const prisma = new PrismaClient();

// Agora.io configuration
const AGORA_APP_ID = process.env.AGORA_APP_ID || '';
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || '';

// Validation schemas
const createSessionSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  termId: z.string().uuid(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  type: z.enum(['LIVE_CLASS', 'RECORDED_LESSON', 'HYBRID']),
  allowRecording: z.boolean().default(true),
  autoRecord: z.boolean().default(true),
  maxParticipants: z.number().optional(),
});

/**
 * Create a new class session
 */
export const createClassSession = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const data = createSessionSchema.parse(req.body);

    // Verify teacher has permission for this class
    const classInfo = await prisma.class.findUnique({
      where: { id: data.classId },
      include: { teacher: true },
    });

    if (!classInfo) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Generate unique meeting ID
    const meetingId = `class-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create session
    const session = await prisma.classSession.create({
      data: {
        ...data,
        teacherId: userId,
        meetingId,
        status: 'SCHEDULED',
      },
      include: {
        class: true,
        subject: true,
        teacher: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    // TODO: Send notifications to students
    // await notifyStudentsAboutClass(session);

    res.status(201).json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
};

/**
 * Get upcoming sessions for a class
 */
export const getClassSessions = async (req: Request, res: Response) => {
  try {
    const { classId, status, startDate, endDate } = req.query;

    const where: any = {};

    if (classId) {
      where.classId = classId as string;
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.scheduledStart = {};
      if (startDate) {
        where.scheduledStart.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.scheduledStart.lte = new Date(endDate as string);
      }
    }

    const sessions = await prisma.classSession.findMany({
      where,
      include: {
        class: true,
        subject: true,
        teacher: {
          select: {
            id: true,
            fullName: true,
          },
        },
        _count: {
          select: {
            participants: true,
          },
        },
      },
      orderBy: {
        scheduledStart: 'asc',
      },
    });

    res.json(sessions);
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

/**
 * Get session details
 */
export const getSessionDetails = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
      include: {
        class: {
          include: {
            students: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                userId: true,
              },
            },
          },
        },
        subject: true,
        teacher: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        materials: {
          include: {
            uploader: {
              select: {
                fullName: true,
              },
            },
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    console.error('Get session details error:', error);
    res.status(500).json({ error: 'Failed to fetch session details' });
  }
};

/**
 * Generate Agora token for joining session
 */
export const getJoinToken = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user?.userId;
    const { role } = req.query; // 'teacher' or 'student'

    // Verify session exists
    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
      include: {
        class: {
          include: {
            students: true,
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check if user is authorized
    const isTeacher = session.teacherId === userId;
    const isStudent = session.class.students.some((s) => s.userId === userId);

    if (!isTeacher && !isStudent) {
      return res.status(403).json({ error: 'Not authorized to join this session' });
    }

    // Generate Agora token
    const channelName = session.meetingId!;
    const uid = 0; // 0 means Agora will assign a random UID
    const agoraRole = isTeacher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const expirationTimeInSeconds = 3600; // 1 hour
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      uid,
      agoraRole,
      privilegeExpiredTs
    );

    // Create or update participant record
    await prisma.classParticipant.upsert({
      where: {
        sessionId_userId: {
          sessionId,
          userId,
        },
      },
      update: {
        joinedAt: new Date(),
      },
      create: {
        sessionId,
        userId,
        role: isTeacher ? 'teacher' : 'student',
        joinedAt: new Date(),
      },
    });

    // Update session status to LIVE if teacher joins
    if (isTeacher && session.status === 'SCHEDULED') {
      await prisma.classSession.update({
        where: { id: sessionId },
        data: {
          status: 'LIVE',
          actualStart: new Date(),
        },
      });
    }

    res.json({
      token,
      appId: AGORA_APP_ID,
      channelName,
      uid,
      sessionId,
      isTeacher,
    });
  } catch (error) {
    console.error('Get join token error:', error);
    res.status(500).json({ error: 'Failed to generate join token' });
  }
};

/**
 * End a live session
 */
export const endSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user?.userId;

    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Only teacher can end session
    if (session.teacherId !== userId) {
      return res.status(403).json({ error: 'Only teacher can end session' });
    }

    // Update session
    const updatedSession = await prisma.classSession.update({
      where: { id: sessionId },
      data: {
        status: 'ENDED',
        actualEnd: new Date(),
      },
    });

    // Update all participants' left time
    await prisma.classParticipant.updateMany({
      where: {
        sessionId,
        leftAt: null,
      },
      data: {
        leftAt: new Date(),
      },
    });

    // Calculate durations
    const participants = await prisma.classParticipant.findMany({
      where: { sessionId },
    });

    for (const participant of participants) {
      if (participant.joinedAt && participant.leftAt) {
        const duration = Math.floor(
          (participant.leftAt.getTime() - participant.joinedAt.getTime()) / 1000
        );
        await prisma.classParticipant.update({
          where: { id: participant.id },
          data: { duration },
        });
      }
    }

    res.json(updatedSession);
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
};

/**
 * Upload class material
 */
export const uploadMaterial = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user?.userId;
    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, description } = req.body;

    const material = await prisma.classMaterial.create({
      data: {
        sessionId,
        title: title || file.originalname,
        description,
        fileUrl: file.path, // Should be S3 URL in production
        fileType: file.mimetype,
        fileSize: file.size,
        uploadedBy: userId,
      },
    });

    res.status(201).json(material);
  } catch (error) {
    console.error('Upload material error:', error);
    res.status(500).json({ error: 'Failed to upload material' });
  }
};

/**
 * Get student's upcoming classes
 */
export const getMyUpcomingClasses = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    // Find student profile
    const student = await prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    // Get upcoming sessions for student's class
    const sessions = await prisma.classSession.findMany({
      where: {
        classId: student.classId,
        scheduledStart: {
          gte: new Date(),
        },
        status: {
          in: ['SCHEDULED', 'LIVE'],
        },
      },
      include: {
        subject: true,
        teacher: {
          select: {
            fullName: true,
          },
        },
        _count: {
          select: {
            participants: true,
          },
        },
      },
      orderBy: {
        scheduledStart: 'asc',
      },
      take: 10,
    });

    res.json(sessions);
  } catch (error) {
    console.error('Get upcoming classes error:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming classes' });
  }
};

/**
 * Get session analytics
 */
export const getSessionAnalytics = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                fullName: true,
                role: true,
              },
            },
          },
        },
        class: {
          include: {
            students: true,
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const totalStudents = session.class.students.length;
    const attendedStudents = session.participants.filter(
      (p) => p.role === 'student' && p.joinedAt
    ).length;
    const attendanceRate = totalStudents > 0 ? (attendedStudents / totalStudents) * 100 : 0;

    const avgDuration =
      session.participants.length > 0
        ? session.participants.reduce((sum, p) => sum + (p.duration || 0), 0) /
          session.participants.length
        : 0;

    const analytics = {
      sessionId: session.id,
      title: session.title,
      totalStudents,
      attendedStudents,
      attendanceRate: Math.round(attendanceRate),
      avgDuration: Math.round(avgDuration),
      participants: session.participants.map((p) => ({
        name: p.user.fullName,
        role: p.role,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
        duration: p.duration,
        cameraOn: p.cameraOn,
        micOn: p.micOn,
        chatMessages: p.chatMessages,
      })),
    };

    res.json(analytics);
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};
