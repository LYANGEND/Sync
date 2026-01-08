import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, getUserId, handleControllerError } from '../utils/tenantContext';

const prisma = new PrismaClient();

const recordAttendanceSchema = z.object({
  classId: z.string().uuid(),
  date: z.string().datetime(),
  records: z.array(z.object({
    studentId: z.string().uuid(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE']),
    reason: z.string().optional(),
  })),
});

export const recordAttendance = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { classId, date, records } = recordAttendanceSchema.parse(req.body);

    // Verify class belongs to this tenant
    const classData = await prisma.class.findFirst({
      where: { id: classId, tenantId }
    });
    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const attendanceDate = new Date(date);
    const nextDay = new Date(attendanceDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Use a transaction to ensure all records are created or none
    const result = await prisma.$transaction(async (tx) => {
      // Delete existing attendance for this class and date to avoid duplicates
      await tx.attendance.deleteMany({
        where: {
          tenantId,
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
          tx.attendance.create({
            data: {
              tenantId,
              classId,
              date: attendanceDate,
              studentId: record.studentId,
              status: record.status,
              reason: record.reason,
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
    handleControllerError(res, error, 'recordAttendance');
  }
};

export const getClassAttendance = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { classId, date } = req.query;

    if (!classId || typeof classId !== 'string') {
      return res.status(400).json({ message: 'Class ID is required' });
    }

    // Verify class belongs to this tenant
    const classData = await prisma.class.findFirst({
      where: { id: classId, tenantId }
    });
    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const whereClause: any = { tenantId, classId };
    if (date && typeof date === 'string') {
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
    handleControllerError(res, error, 'getClassAttendance');
  }
};

export const getStudentAttendance = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { studentId } = req.params;

    // Verify student belongs to this tenant
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId }
    });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const attendance = await prisma.attendance.findMany({
      where: { tenantId, studentId },
      orderBy: {
        date: 'desc',
      },
    });

    res.json(attendance);
  } catch (error) {
    handleControllerError(res, error, 'getStudentAttendance');
  }
};

export const getAttendanceAnalytics = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { classId, startDate, endDate } = req.query;

    if (!classId || !startDate || !endDate) {
      return res.status(400).json({ message: 'classId, startDate, and endDate are required' });
    }

    // Verify class belongs to this tenant
    const classData = await prisma.class.findFirst({
      where: { id: classId as string, tenantId }
    });
    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);

    // Get all students in the class
    const students = await prisma.student.findMany({
      where: { tenantId, classId: classId as string, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true }
    });

    // Get all attendance records for the date range
    const records = await prisma.attendance.findMany({
      where: {
        tenantId,
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
    handleControllerError(res, error, 'getAttendanceAnalytics');
  }
};
