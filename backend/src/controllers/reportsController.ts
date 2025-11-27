import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============ FINANCIAL REPORTS ============

// Debtors List - Students with outstanding balances
export const getDebtorsList = async (req: Request, res: Response) => {
  try {
    const { classId, minAmount } = req.query;

    const students = await prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        ...(classId ? { classId: String(classId) } : {}),
      },
      include: {
        class: { select: { name: true, gradeLevel: true } },
        feeStructures: {
          include: { feeTemplate: true }
        },
        payments: {
          select: { amount: true }
        }
      }
    });

    const debtors = students.map(student => {
      const totalDue = student.feeStructures.reduce((sum, fs) => sum + Number(fs.amountDue), 0);
      const totalPaid = student.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = totalDue - totalPaid;

      return {
        id: student.id,
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        className: student.class?.name,
        gradeLevel: student.class?.gradeLevel,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
        totalDue,
        totalPaid,
        balance,
        status: balance <= 0 ? 'PAID' : balance < totalDue * 0.5 ? 'PARTIAL' : 'UNPAID'
      };
    })
    .filter(d => d.balance > 0)
    .filter(d => !minAmount || d.balance >= Number(minAmount))
    .sort((a, b) => b.balance - a.balance);

    const summary = {
      totalDebtors: debtors.length,
      totalOutstanding: debtors.reduce((sum, d) => sum + d.balance, 0),
      criticalCount: debtors.filter(d => d.status === 'UNPAID').length,
      partialCount: debtors.filter(d => d.status === 'PARTIAL').length,
    };

    res.json({ debtors, summary });
  } catch (error) {
    console.error('Debtors list error:', error);
    res.status(500).json({ error: 'Failed to fetch debtors list' });
  }
};

// Daily Collection Report
export const getDailyCollectionReport = async (req: Request, res: Response) => {
  try {
    const { date, startDate, endDate } = req.query;

    let dateFilter: any = {};
    if (date) {
      const targetDate = new Date(String(date));
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      dateFilter = { paymentDate: { gte: targetDate, lt: nextDate } };
    } else if (startDate && endDate) {
      dateFilter = {
        paymentDate: {
          gte: new Date(String(startDate)),
          lte: new Date(String(endDate))
        }
      };
    } else {
      // Default to today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateFilter = { paymentDate: { gte: today, lt: tomorrow } };
    }

    const payments = await prisma.payment.findMany({
      where: dateFilter,
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNumber: true,
            class: { select: { name: true } }
          }
        },
        recordedBy: { select: { fullName: true } }
      },
      orderBy: { paymentDate: 'desc' }
    });

    // Group by method
    const byMethod = payments.reduce((acc: any, p) => {
      acc[p.method] = (acc[p.method] || 0) + Number(p.amount);
      return acc;
    }, {});

    // Group by user
    const byUser = payments.reduce((acc: any, p) => {
      const userName = p.recordedBy.fullName;
      acc[userName] = (acc[userName] || 0) + Number(p.amount);
      return acc;
    }, {});

    const summary = {
      totalAmount: payments.reduce((sum, p) => sum + Number(p.amount), 0),
      transactionCount: payments.length,
      byMethod,
      byUser
    };

    res.json({
      payments: payments.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        referenceNumber: p.referenceNumber,
        paymentDate: p.paymentDate,
        studentName: `${p.student.firstName} ${p.student.lastName}`,
        admissionNumber: p.student.admissionNumber,
        className: p.student.class?.name,
        recordedBy: p.recordedBy.fullName
      })),
      summary
    });
  } catch (error) {
    console.error('Daily collection error:', error);
    res.status(500).json({ error: 'Failed to fetch collection report' });
  }
};

// Fee Collection Summary by Class
export const getFeeCollectionSummary = async (req: Request, res: Response) => {
  try {
    const { termId } = req.query;

    const classes = await prisma.class.findMany({
      include: {
        students: {
          where: { status: 'ACTIVE' },
          include: {
            feeStructures: {
              where: termId ? {
                feeTemplate: { academicTermId: String(termId) }
              } : {},
            },
            payments: true
          }
        }
      }
    });

    const summary = classes.map(cls => {
      let totalDue = 0;
      let totalPaid = 0;
      let paidCount = 0;
      let partialCount = 0;
      let unpaidCount = 0;

      cls.students.forEach(student => {
        const due = student.feeStructures.reduce((sum, fs) => sum + Number(fs.amountDue), 0);
        const paid = student.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        totalDue += due;
        totalPaid += paid;

        if (due > 0) {
          if (paid >= due) paidCount++;
          else if (paid > 0) partialCount++;
          else unpaidCount++;
        }
      });

      return {
        classId: cls.id,
        className: cls.name,
        gradeLevel: cls.gradeLevel,
        studentCount: cls.students.length,
        totalDue,
        totalPaid,
        balance: totalDue - totalPaid,
        collectionRate: totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0,
        paidCount,
        partialCount,
        unpaidCount
      };
    }).sort((a, b) => a.gradeLevel - b.gradeLevel);

    const totals = {
      totalDue: summary.reduce((sum, s) => sum + s.totalDue, 0),
      totalPaid: summary.reduce((sum, s) => sum + s.totalPaid, 0),
      totalBalance: summary.reduce((sum, s) => sum + s.balance, 0),
      overallRate: 0
    };
    totals.overallRate = totals.totalDue > 0 ? Math.round((totals.totalPaid / totals.totalDue) * 100) : 0;

    res.json({ classes: summary, totals });
  } catch (error) {
    console.error('Fee summary error:', error);
    res.status(500).json({ error: 'Failed to fetch fee summary' });
  }
};

// ============ ATTENDANCE REPORTS ============

// Daily Attendance Summary
export const getAttendanceSummary = async (req: Request, res: Response) => {
  try {
    const { date, classId } = req.query;
    
    const targetDate = date ? new Date(String(date)) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const whereClause: any = {
      date: { gte: targetDate, lt: nextDate }
    };
    if (classId) whereClause.classId = String(classId);

    const attendance = await prisma.attendance.findMany({
      where: whereClause,
      include: {
        class: { select: { id: true, name: true, gradeLevel: true } }
      }
    });

    // Group by class
    const byClass: Record<string, any> = {};
    attendance.forEach(a => {
      if (!byClass[a.classId]) {
        byClass[a.classId] = {
          classId: a.classId,
          className: a.class.name,
          gradeLevel: a.class.gradeLevel,
          present: 0,
          absent: 0,
          late: 0,
          total: 0
        };
      }
      byClass[a.classId][a.status.toLowerCase()]++;
      byClass[a.classId].total++;
    });

    const classSummary = Object.values(byClass).map((c: any) => ({
      ...c,
      presentRate: c.total > 0 ? Math.round(((c.present + c.late) / c.total) * 100) : 0
    })).sort((a: any, b: any) => a.gradeLevel - b.gradeLevel);

    const totals = {
      present: attendance.filter(a => a.status === 'PRESENT').length,
      absent: attendance.filter(a => a.status === 'ABSENT').length,
      late: attendance.filter(a => a.status === 'LATE').length,
      total: attendance.length,
      presentRate: attendance.length > 0 
        ? Math.round((attendance.filter(a => a.status !== 'ABSENT').length / attendance.length) * 100) 
        : 0
    };

    res.json({ date: targetDate, classes: classSummary, totals });
  } catch (error) {
    console.error('Attendance summary error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance summary' });
  }
};

// Student Attendance History
export const getStudentAttendanceHistory = async (req: Request, res: Response) => {
  try {
    const { studentId, startDate, endDate } = req.query;

    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const whereClause: any = { studentId: String(studentId) };
    if (startDate && endDate) {
      whereClause.date = {
        gte: new Date(String(startDate)),
        lte: new Date(String(endDate))
      };
    }

    const attendance = await prisma.attendance.findMany({
      where: whereClause,
      orderBy: { date: 'desc' },
      take: 100
    });

    const summary = {
      present: attendance.filter(a => a.status === 'PRESENT').length,
      absent: attendance.filter(a => a.status === 'ABSENT').length,
      late: attendance.filter(a => a.status === 'LATE').length,
      total: attendance.length,
      attendanceRate: attendance.length > 0
        ? Math.round((attendance.filter(a => a.status !== 'ABSENT').length / attendance.length) * 100)
        : 0
    };

    res.json({ records: attendance, summary });
  } catch (error) {
    console.error('Student attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance history' });
  }
};

// Absenteeism Report - Students with high absence rates
export const getAbsenteeismReport = async (req: Request, res: Response) => {
  try {
    const { classId, threshold = 20 } = req.query;

    // Get last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const students = await prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        ...(classId ? { classId: String(classId) } : {})
      },
      include: {
        class: { select: { name: true } },
        attendance: {
          where: { date: { gte: startDate, lte: endDate } }
        }
      }
    });

    const report = students.map(student => {
      const total = student.attendance.length;
      const absent = student.attendance.filter(a => a.status === 'ABSENT').length;
      const absentRate = total > 0 ? Math.round((absent / total) * 100) : 0;

      return {
        id: student.id,
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        className: student.class?.name,
        guardianPhone: student.guardianPhone,
        totalDays: total,
        absentDays: absent,
        absentRate
      };
    })
    .filter(s => s.absentRate >= Number(threshold))
    .sort((a, b) => b.absentRate - a.absentRate);

    res.json({
      period: { startDate, endDate },
      threshold: Number(threshold),
      students: report,
      count: report.length
    });
  } catch (error) {
    console.error('Absenteeism report error:', error);
    res.status(500).json({ error: 'Failed to fetch absenteeism report' });
  }
};

// ============ STUDENT REPORTS ============

// Class List / Roster
export const getClassRoster = async (req: Request, res: Response) => {
  try {
    const { classId } = req.query;

    if (!classId) {
      return res.status(400).json({ error: 'Class ID is required' });
    }

    const classData = await prisma.class.findUnique({
      where: { id: String(classId) },
      include: {
        teacher: { select: { fullName: true } },
        students: {
          where: { status: 'ACTIVE' },
          orderBy: { lastName: 'asc' },
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
            gender: true,
            dateOfBirth: true,
            guardianName: true,
            guardianPhone: true
          }
        }
      }
    });

    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    res.json({
      className: classData.name,
      gradeLevel: classData.gradeLevel,
      teacher: classData.teacher?.fullName,
      studentCount: classData.students.length,
      students: classData.students.map((s, i) => ({ ...s, index: i + 1 }))
    });
  } catch (error) {
    console.error('Class roster error:', error);
    res.status(500).json({ error: 'Failed to fetch class roster' });
  }
};

// Enrollment Statistics
export const getEnrollmentStats = async (req: Request, res: Response) => {
  try {
    const students = await prisma.student.findMany({
      include: { class: { select: { gradeLevel: true } } }
    });

    // By status
    const byStatus = {
      ACTIVE: students.filter(s => s.status === 'ACTIVE').length,
      TRANSFERRED: students.filter(s => s.status === 'TRANSFERRED').length,
      GRADUATED: students.filter(s => s.status === 'GRADUATED').length,
      DROPPED_OUT: students.filter(s => s.status === 'DROPPED_OUT').length
    };

    // By gender (active only)
    const activeStudents = students.filter(s => s.status === 'ACTIVE');
    const byGender = {
      MALE: activeStudents.filter(s => s.gender === 'MALE').length,
      FEMALE: activeStudents.filter(s => s.gender === 'FEMALE').length
    };

    // By grade level (active only)
    const byGrade: Record<number, number> = {};
    activeStudents.forEach(s => {
      const grade = s.class?.gradeLevel || 0;
      byGrade[grade] = (byGrade[grade] || 0) + 1;
    });

    res.json({
      total: students.length,
      active: byStatus.ACTIVE,
      byStatus,
      byGender,
      byGrade: Object.entries(byGrade)
        .map(([grade, count]) => ({ grade: Number(grade), count }))
        .sort((a, b) => a.grade - b.grade)
    });
  } catch (error) {
    console.error('Enrollment stats error:', error);
    res.status(500).json({ error: 'Failed to fetch enrollment stats' });
  }
};
