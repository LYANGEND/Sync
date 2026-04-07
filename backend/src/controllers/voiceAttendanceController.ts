import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import * as voiceAttendanceService from '../services/voiceAttendanceService';

// ==========================================
// VOICE ATTENDANCE CONTROLLER
// ==========================================
// Take attendance using voice or text commands

/**
 * POST /api/v1/voice-attendance/take-by-voice
 * Take attendance using voice audio
 */
export const takeAttendanceByVoice = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { classId, date } = req.body;

    if (!classId) {
      return res.status(400).json({ error: 'classId is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const attendanceDate = date ? new Date(date) : new Date();

    const result = await voiceAttendanceService.processVoiceAttendance(
      classId,
      req.file.buffer,
      attendanceDate,
      req.file.mimetype
    );

    res.json({
      success: true,
      ...result,
      message: `Attendance recorded: ${result.present.length} present, ${result.absent.length} absent, ${result.late.length} late`,
    });
  } catch (error: any) {
    console.error('Voice attendance error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to process voice attendance' 
    });
  }
};

/**
 * POST /api/v1/voice-attendance/take-by-text
 * Take attendance using text command
 */
export const takeAttendanceByText = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { classId, textInput, date } = req.body;

    if (!classId || !textInput) {
      return res.status(400).json({ 
        error: 'classId and textInput are required' 
      });
    }

    const attendanceDate = date ? new Date(date) : new Date();

    const result = await voiceAttendanceService.processTextAttendance(
      classId,
      textInput,
      attendanceDate
    );

    res.json({
      success: true,
      ...result,
      message: `Attendance recorded: ${result.present.length} present, ${result.absent.length} absent, ${result.late.length} late`,
    });
  } catch (error: any) {
    console.error('Text attendance error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to process text attendance' 
    });
  }
};

/**
 * GET /api/v1/voice-attendance/verify/:classId
 * Get today's attendance for verification
 */
export const verifyAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { classId } = req.params;
    const { date } = req.query;

    const attendanceDate = date ? new Date(date as string) : new Date();
    attendanceDate.setHours(0, 0, 0, 0);

    const { prisma } = await import('../utils/prisma');

    const attendance = await prisma.attendance.findMany({
      where: {
        classId,
        date: attendanceDate,
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
          },
        },
      },
      orderBy: {
        student: {
          lastName: 'asc',
        },
      },
    });

    const summary = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'PRESENT').length,
      absent: attendance.filter(a => a.status === 'ABSENT').length,
      late: attendance.filter(a => a.status === 'LATE').length,
    };

    res.json({
      date: attendanceDate.toISOString(),
      summary,
      attendance,
    });
  } catch (error: any) {
    console.error('Verify attendance error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to verify attendance' 
    });
  }
};
