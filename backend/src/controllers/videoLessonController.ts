import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, getUserId, getUserRole } from '../utils/tenantContext';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient() as any;

// Validation schemas
const createVideoLessonSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  roomPassword: z.string().optional(),
  isRecordingEnabled: z.boolean().default(false),
});

const updateVideoLessonSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
  status: z.enum(['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED']).optional(),
});

// Generate a unique Jitsi room ID
const generateRoomId = (tenantId: string, title: string): string => {
  const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  const uniqueId = uuidv4().split('-')[0];
  return `sync-${tenantId.slice(0, 8)}-${sanitizedTitle.slice(0, 20)}-${uniqueId}`;
};

// Create a new video lesson (Teacher only)
export const createVideoLesson = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const data = createVideoLessonSchema.parse(req.body);

    // Verify class and subject belong to tenant
    const [classData, subject] = await Promise.all([
      prisma.class.findFirst({ where: { id: data.classId, tenantId } }),
      prisma.subject.findFirst({ where: { id: data.subjectId, tenantId } }),
    ]);

    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }
    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Generate unique room ID
    const roomId = generateRoomId(tenantId, data.title);

    const videoLesson = await prisma.videoLesson.create({
      data: {
        tenantId,
        teacherId,
        classId: data.classId,
        subjectId: data.subjectId,
        title: data.title,
        description: data.description,
        scheduledStart: new Date(data.scheduledStart),
        scheduledEnd: new Date(data.scheduledEnd),
        roomId,
        roomPassword: data.roomPassword,
        isRecordingEnabled: data.isRecordingEnabled,
        status: 'SCHEDULED',
      },
      include: {
        class: true,
        subject: true,
        teacher: {
          select: { id: true, fullName: true },
        },
      },
    });

    res.status(201).json(videoLesson);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Create video lesson error:', error);
    res.status(500).json({ error: 'Failed to create video lesson' });
  }
};

// Get video lessons for teacher
export const getTeacherVideoLessons = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const { status, classId } = req.query;

    const where: any = { tenantId, teacherId };

    if (status) {
      where.status = status as string;
    }
    if (classId) {
      where.classId = classId as string;
    }

    const videoLessons = await prisma.videoLesson.findMany({
      where,
      include: {
        class: true,
        subject: true,
        _count: {
          select: { attendees: true },
        },
      },
      orderBy: { scheduledStart: 'desc' },
    });

    res.json(videoLessons);
  } catch (error) {
    console.error('Get teacher video lessons error:', error);
    res.status(500).json({ error: 'Failed to fetch video lessons' });
  }
};

// Get upcoming video lessons for student/parent
export const getStudentVideoLessons = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);
    const { studentId } = req.query;

    let student;

    if (role === 'PARENT') {
      if (!studentId) {
        return res.status(400).json({ error: 'Student ID is required for parents' });
      }
      student = await prisma.student.findFirst({
        where: { id: studentId as string, tenantId, parentId: userId },
      });
      if (!student) {
        return res.status(403).json({ error: 'Unauthorized: Not your child' });
      }
    } else {
      student = await prisma.student.findFirst({
        where: { userId, tenantId },
      });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    // Get video lessons for student's class
    const videoLessons = await prisma.videoLesson.findMany({
      where: {
        tenantId,
        classId: student.classId,
        status: { in: ['SCHEDULED', 'LIVE'] },
        scheduledStart: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Past 24 hours
      },
      include: {
        class: true,
        subject: true,
        teacher: {
          select: { id: true, fullName: true },
        },
        attendees: {
          where: { studentId: student.id },
          select: { joinedAt: true },
        },
      },
      orderBy: { scheduledStart: 'asc' },
    });

    res.json(videoLessons);
  } catch (error) {
    console.error('Get student video lessons error:', error);
    res.status(500).json({ error: 'Failed to fetch video lessons' });
  }
};

// Get single video lesson details
export const getVideoLesson = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { lessonId } = req.params;

    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId },
      include: {
        class: true,
        subject: true,
        teacher: {
          select: { id: true, fullName: true, profilePictureUrl: true },
        },
        attendees: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Video lesson not found' });
    }

    res.json(videoLesson);
  } catch (error) {
    console.error('Get video lesson error:', error);
    res.status(500).json({ error: 'Failed to fetch video lesson' });
  }
};

// Start a video lesson (Teacher only)
export const startVideoLesson = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const { lessonId } = req.params;

    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId, teacherId },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Video lesson not found' });
    }

    if (videoLesson.status !== 'SCHEDULED') {
      return res.status(400).json({ error: 'Lesson cannot be started' });
    }

    const updated = await prisma.videoLesson.update({
      where: { id: lessonId },
      data: {
        status: 'LIVE',
        actualStart: new Date(),
      },
      include: {
        class: true,
        subject: true,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Start video lesson error:', error);
    res.status(500).json({ error: 'Failed to start video lesson' });
  }
};

// End a video lesson (Teacher only)
export const endVideoLesson = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const { lessonId } = req.params;

    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId, teacherId },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Video lesson not found' });
    }

    if (videoLesson.status !== 'LIVE') {
      return res.status(400).json({ error: 'Lesson is not live' });
    }

    const updated = await prisma.videoLesson.update({
      where: { id: lessonId },
      data: {
        status: 'ENDED',
        actualEnd: new Date(),
      },
    });

    // Update all attendees who haven't left
    await prisma.videoLessonAttendee.updateMany({
      where: {
        videoLessonId: lessonId,
        leftAt: null,
      },
      data: {
        leftAt: new Date(),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('End video lesson error:', error);
    res.status(500).json({ error: 'Failed to end video lesson' });
  }
};

// Cancel a video lesson (Teacher only)
export const cancelVideoLesson = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const { lessonId } = req.params;

    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId, teacherId },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Video lesson not found' });
    }

    if (videoLesson.status === 'ENDED') {
      return res.status(400).json({ error: 'Cannot cancel ended lesson' });
    }

    const updated = await prisma.videoLesson.update({
      where: { id: lessonId },
      data: { status: 'CANCELLED' },
    });

    res.json(updated);
  } catch (error) {
    console.error('Cancel video lesson error:', error);
    res.status(500).json({ error: 'Failed to cancel video lesson' });
  }
};

// Update a video lesson (Teacher only)
export const updateVideoLesson = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const { lessonId } = req.params;
    const data = updateVideoLessonSchema.parse(req.body);

    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId, teacherId },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Video lesson not found' });
    }

    const updateData: any = { ...data };
    if (data.scheduledStart) {
      updateData.scheduledStart = new Date(data.scheduledStart);
    }
    if (data.scheduledEnd) {
      updateData.scheduledEnd = new Date(data.scheduledEnd);
    }

    const updated = await prisma.videoLesson.update({
      where: { id: lessonId },
      data: updateData,
      include: {
        class: true,
        subject: true,
      },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Update video lesson error:', error);
    res.status(500).json({ error: 'Failed to update video lesson' });
  }
};

// Record student joining a lesson
export const joinVideoLesson = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);
    const { lessonId } = req.params;
    const { studentId } = req.body;

    let student;

    if (role === 'PARENT') {
      if (!studentId) {
        return res.status(400).json({ error: 'Student ID is required for parents' });
      }
      student = await prisma.student.findFirst({
        where: { id: studentId, tenantId, parentId: userId },
      });
      if (!student) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    } else {
      student = await prisma.student.findFirst({
        where: { userId, tenantId },
      });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId, classId: student.classId },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Video lesson not found or not for your class' });
    }

    // Record attendance
    const attendee = await prisma.videoLessonAttendee.upsert({
      where: {
        videoLessonId_studentId: {
          videoLessonId: lessonId,
          studentId: student.id,
        },
      },
      update: {
        joinedAt: new Date(),
        leftAt: null,
      },
      create: {
        videoLessonId: lessonId,
        studentId: student.id,
      },
    });

    res.json({
      ...videoLesson,
      attendee,
      jitsiConfig: {
        roomName: videoLesson.roomId,
        password: videoLesson.roomPassword,
        displayName: `${student.firstName} ${student.lastName}`,
        subject: videoLesson.title,
      },
    });
  } catch (error) {
    console.error('Join video lesson error:', error);
    res.status(500).json({ error: 'Failed to join video lesson' });
  }
};

// Record student leaving a lesson
export const leaveVideoLesson = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const role = getUserRole(req);
    const { lessonId } = req.params;
    const { studentId } = req.body;

    let student;

    if (role === 'PARENT') {
      if (!studentId) {
        return res.status(400).json({ error: 'Student ID is required' });
      }
      student = await prisma.student.findFirst({
        where: { id: studentId, tenantId, parentId: userId },
      });
    } else {
      student = await prisma.student.findFirst({
        where: { userId, tenantId },
      });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const attendee = await prisma.videoLessonAttendee.findUnique({
      where: {
        videoLessonId_studentId: {
          videoLessonId: lessonId,
          studentId: student.id,
        },
      },
    });

    if (!attendee) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    // Calculate duration
    const duration = Math.round(
      (Date.now() - new Date(attendee.joinedAt).getTime()) / 60000
    );

    await prisma.videoLessonAttendee.update({
      where: { id: attendee.id },
      data: {
        leftAt: new Date(),
        duration,
      },
    });

    res.json({ success: true, duration });
  } catch (error) {
    console.error('Leave video lesson error:', error);
    res.status(500).json({ error: 'Failed to record leave' });
  }
};

// Get attendance for a video lesson (Teacher only)
export const getVideoLessonAttendance = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { lessonId } = req.params;

    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId },
      include: {
        class: {
          include: {
            students: {
              where: { status: 'ACTIVE' },
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        attendees: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Video lesson not found' });
    }

    // Calculate who attended and who didn't
    const attendedIds = new Set(videoLesson.attendees.map((a: any) => a.studentId));
    const allStudents = videoLesson.class.students;

    const attendance = {
      totalStudents: allStudents.length,
      attended: videoLesson.attendees.length,
      absent: allStudents.length - videoLesson.attendees.length,
      attendees: videoLesson.attendees,
      absentees: allStudents.filter((s: any) => !attendedIds.has(s.id)),
    };

    res.json(attendance);
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
};

// Delete a video lesson (Teacher only, before it starts)
export const deleteVideoLesson = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const { lessonId } = req.params;

    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId, teacherId },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Video lesson not found' });
    }

    if (videoLesson.status !== 'SCHEDULED') {
      return res.status(400).json({ error: 'Can only delete scheduled lessons' });
    }

    await prisma.videoLesson.delete({
      where: { id: lessonId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete video lesson error:', error);
    res.status(500).json({ error: 'Failed to delete video lesson' });
  }
};

// Get Jitsi join config for teacher
export const getTeacherJitsiConfig = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const { lessonId } = req.params;

    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId, teacherId },
      include: {
        teacher: {
          select: { fullName: true },
        },
      },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Video lesson not found' });
    }

    res.json({
      roomName: videoLesson.roomId,
      password: videoLesson.roomPassword,
      displayName: videoLesson.teacher.fullName,
      subject: videoLesson.title,
      isModerator: true,
    });
  } catch (error) {
    console.error('Get Jitsi config error:', error);
    res.status(500).json({ error: 'Failed to get Jitsi config' });
  }
};

// ===================== CHAT FEATURES =====================

// Send a chat message (Teacher or Student)
export const sendChatMessage = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const userRole = getUserRole(req);
    const { lessonId } = req.params;
    const { message, studentId, senderName } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Verify lesson exists and is live
    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId, status: 'LIVE' },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Live lesson not found' });
    }

    let senderId: string;
    let senderType: string;
    let finalSenderName: string;

    if (userRole === 'TEACHER') {
      senderId = userId;
      senderType = 'TEACHER';
      const teacher = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      finalSenderName = teacher?.fullName || 'Teacher';
    } else {
      // Parent sending on behalf of student
      if (!studentId) {
        return res.status(400).json({ error: 'Student ID is required' });
      }
      senderId = studentId;
      senderType = 'STUDENT';
      finalSenderName = senderName || 'Student';
    }

    const chatMessage = await prisma.videoLessonChat.create({
      data: {
        videoLessonId: lessonId,
        senderId,
        senderType,
        senderName: finalSenderName,
        message: message.trim(),
      },
    });

    res.status(201).json(chatMessage);
  } catch (error) {
    console.error('Send chat message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// Get chat messages for a lesson
export const getChatMessages = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { lessonId } = req.params;
    const { since } = req.query;

    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const where: any = { videoLessonId: lessonId };
    if (since) {
      where.createdAt = { gt: new Date(since as string) };
    }

    const messages = await prisma.videoLessonChat.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    res.json(messages);
  } catch (error) {
    console.error('Get chat messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

// ===================== RAISE HAND FEATURES =====================

// Raise hand (Student only)
export const raiseHand = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { lessonId } = req.params;
    const { studentId, studentName } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    // Verify lesson is live
    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId, status: 'LIVE' },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Live lesson not found' });
    }

    // Check if already has active raised hand
    const existingHand = await prisma.videoLessonRaisedHand.findFirst({
      where: { videoLessonId: lessonId, studentId, isActive: true },
    });

    if (existingHand) {
      return res.status(400).json({ error: 'Hand already raised' });
    }

    const raisedHand = await prisma.videoLessonRaisedHand.create({
      data: {
        videoLessonId: lessonId,
        studentId,
        studentName: studentName || 'Student',
        isActive: true,
      },
    });

    res.status(201).json(raisedHand);
  } catch (error) {
    console.error('Raise hand error:', error);
    res.status(500).json({ error: 'Failed to raise hand' });
  }
};

// Lower hand (Student only)
export const lowerHand = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { lessonId } = req.params;
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const raisedHand = await prisma.videoLessonRaisedHand.findFirst({
      where: { videoLessonId: lessonId, studentId, isActive: true },
    });

    if (!raisedHand) {
      return res.status(404).json({ error: 'No active raised hand found' });
    }

    const updated = await prisma.videoLessonRaisedHand.update({
      where: { id: raisedHand.id },
      data: { isActive: false, loweredAt: new Date() },
    });

    res.json(updated);
  } catch (error) {
    console.error('Lower hand error:', error);
    res.status(500).json({ error: 'Failed to lower hand' });
  }
};

// Get raised hands for a lesson (Teacher view)
export const getRaisedHands = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { lessonId } = req.params;

    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const raisedHands = await prisma.videoLessonRaisedHand.findMany({
      where: { videoLessonId: lessonId, isActive: true },
      orderBy: { raisedAt: 'asc' },
      include: {
        student: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    res.json(raisedHands);
  } catch (error) {
    console.error('Get raised hands error:', error);
    res.status(500).json({ error: 'Failed to fetch raised hands' });
  }
};

// Acknowledge raised hand (Teacher only)
export const acknowledgeHand = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const { lessonId, handId } = req.params;

    // Verify teacher owns this lesson
    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId, teacherId },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const raisedHand = await prisma.videoLessonRaisedHand.update({
      where: { id: handId },
      data: { acknowledgedAt: new Date(), isActive: false, loweredAt: new Date() },
    });

    res.json(raisedHand);
  } catch (error) {
    console.error('Acknowledge hand error:', error);
    res.status(500).json({ error: 'Failed to acknowledge hand' });
  }
};

// Dismiss all raised hands (Teacher only)
export const dismissAllHands = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const teacherId = getUserId(req);
    const { lessonId } = req.params;

    const videoLesson = await prisma.videoLesson.findFirst({
      where: { id: lessonId, tenantId, teacherId },
    });

    if (!videoLesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    await prisma.videoLessonRaisedHand.updateMany({
      where: { videoLessonId: lessonId, isActive: true },
      data: { isActive: false, loweredAt: new Date() },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Dismiss all hands error:', error);
    res.status(500).json({ error: 'Failed to dismiss hands' });
  }
};
