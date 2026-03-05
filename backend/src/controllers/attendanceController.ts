import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';

const recordAttendanceSchema = z.object({
  classId: z.string().uuid(),
  date: z.string().datetime(),
  records: z.array(z.object({
    studentId: z.string().uuid(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE']),
  })),
});

export const recordAttendance = async (req: Request, res: Response) => {
  try {
    const { classId, date, records } = recordAttendanceSchema.parse(req.body);
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const attendanceDate = new Date(date);
    const nextDay = new Date(attendanceDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Use a transaction to ensure all records are created or none
    const result = await prisma.$transaction(async (prisma) => {
      // Delete existing attendance for this class and date to avoid duplicates
      await prisma.attendance.deleteMany({
        where: {
          classId,
          date: {
            gte: attendanceDate,
            lt: nextDay,
          },
        },
      });

      // Create new records
      return Promise.all(
        records.map((record) =>
          prisma.attendance.create({
            data: {
              classId,
              date: attendanceDate,
              studentId: record.studentId,
              status: record.status,
              recordedByUserId: userId,
            },
          })
        )
      );
    });

    res.status(201).json({ message: 'Attendance recorded successfully', count: result.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Record attendance error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getClassAttendance = async (req: Request, res: Response) => {
  try {
    const { classId, date } = req.query;

    if (!classId || typeof classId !== 'string') {
      return res.status(400).json({ message: 'Class ID is required' });
    }

    const whereClause: any = { classId };
    if (date && typeof date === 'string') {
      // Filter by date (ignoring time for simplicity in this example, 
      // but in production you'd want to handle timezones carefully)
      const searchDate = new Date(date);
      const nextDay = new Date(searchDate);
      nextDay.setDate(nextDay.getDate() + 1);

      whereClause.date = {
        gte: searchDate,
        lt: nextDay,
      };
    }

    const attendance = await prisma.attendance.findMany({
      where: whereClause,
      include: {
        student: {
          select: {
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

    res.json(attendance);
  } catch (error) {
    console.error('Get class attendance error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getStudentAttendance = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;

    const attendance = await prisma.attendance.findMany({
      where: { studentId },
      orderBy: {
        date: 'desc',
      },
    });

    res.json(attendance);
  } catch (error) {
    console.error('Get student attendance error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getAttendanceAnalytics = async (req: Request, res: Response) => {
  try {
    const { classId, startDate, endDate } = req.query;

    if (!classId || !startDate || !endDate) {
      return res.status(400).json({ message: 'classId, startDate, and endDate are required' });
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);

    // Get all students in the class
    const students = await prisma.student.findMany({
      where: { classId: classId as string, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true }
    });

    // Get all attendance records for the date range
    const records = await prisma.attendance.findMany({
      where: {
        classId: classId as string,
        date: { gte: start, lte: end }
      },
      orderBy: { date: 'asc' }
    });

    // Group by date for daily summary
    const dailyMap: Record<string, { present: number; absent: number; late: number; total: number }> = {};
    records.forEach(r => {
      const dateKey = r.date.toISOString().split('T')[0];
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { present: 0, absent: 0, late: 0, total: 0 };
      }
      dailyMap[dateKey].total++;
      if (r.status === 'PRESENT') dailyMap[dateKey].present++;
      else if (r.status === 'ABSENT') dailyMap[dateKey].absent++;
      else if (r.status === 'LATE') dailyMap[dateKey].late++;
    });

    const dailyData = Object.entries(dailyMap).map(([date, data]) => ({ date, ...data }));

    // Student summaries
    const studentMap: Record<string, { present: number; absent: number; late: number }> = {};
    students.forEach(s => {
      studentMap[s.id] = { present: 0, absent: 0, late: 0 };
    });

    records.forEach(r => {
      if (studentMap[r.studentId]) {
        if (r.status === 'PRESENT') studentMap[r.studentId].present++;
        else if (r.status === 'ABSENT') studentMap[r.studentId].absent++;
        else if (r.status === 'LATE') studentMap[r.studentId].late++;
      }
    });

    const totalDays = dailyData.length;
    const studentSummaries = students.map(s => {
      const data = studentMap[s.id];
      const totalRecorded = data.present + data.absent + data.late;
      return {
        studentId: s.id,
        studentName: `${s.firstName} ${s.lastName}`,
        admissionNumber: s.admissionNumber,
        presentDays: data.present,
        absentDays: data.absent,
        lateDays: data.late,
        attendanceRate: totalRecorded > 0 ? (data.present / totalRecorded) * 100 : 0
      };
    });

    res.json({ dailyData, studentSummaries, totalDays });
  } catch (error) {
    console.error('Get attendance analytics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

