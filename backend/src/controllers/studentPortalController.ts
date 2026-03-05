import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
// Get comprehensive academic dashboard for a student
export const getStudentAcademicDashboard = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;

    // Authorization: parents can only see their children's data
    if (userRole === 'PARENT') {
      const student = await prisma.student.findFirst({
        where: { id: studentId, parentId: userId }
      });
      if (!student) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Get student info
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: { include: { subjects: true } },
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get active term
    const settings = await prisma.schoolSettings.findFirst({
      include: { currentTerm: true }
    });
    const activeTerm = settings?.currentTerm;

    if (!activeTerm) {
      return res.json({
        student,
        currentGrades: [],
        attendanceSummary: { present: 0, absent: 0, late: 0, total: 0, percentage: 0 },
        upcomingAssessments: [],
        recentResults: [],
        termResults: [],
      });
    }

    // 1. Current grades per subject (term results)
    const termResults = await prisma.termResult.findMany({
      where: { studentId, termId: activeTerm.id },
      include: { subject: true },
      orderBy: { subject: { name: 'asc' } },
    });

    // 2. Attendance summary for current term
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        studentId,
        date: { gte: activeTerm.startDate, lte: activeTerm.endDate },
      },
    });

    const attendanceSummary = {
      present: attendanceRecords.filter(a => a.status === 'PRESENT').length,
      absent: attendanceRecords.filter(a => a.status === 'ABSENT').length,
      late: attendanceRecords.filter(a => a.status === 'LATE').length,
      total: attendanceRecords.length,
      percentage: attendanceRecords.length > 0
        ? Math.round((attendanceRecords.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length / attendanceRecords.length) * 100)
        : 0,
    };

    // 3. Upcoming assessments (future date)
    const upcomingAssessments = await prisma.assessment.findMany({
      where: {
        classId: student.classId,
        termId: activeTerm.id,
        date: { gte: new Date() },
      },
      include: { subject: true },
      orderBy: { date: 'asc' },
      take: 10,
    });

    // 4. Recent assessment results
    const recentResults = await prisma.assessmentResult.findMany({
      where: {
        studentId,
        assessment: { termId: activeTerm.id },
      },
      include: {
        assessment: {
          include: { subject: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // 5. Historical term results (for trend analysis)
    const allTermResults = await prisma.termResult.findMany({
      where: { studentId },
      include: {
        subject: true,
        term: true,
      },
      orderBy: { term: { startDate: 'asc' } },
    });

    // 6. Class ranking (position)
    const classTermResults = await prisma.termResult.findMany({
      where: {
        classId: student.classId,
        termId: activeTerm.id,
      },
    });

    // Calculate average per student
    const studentAverages = new Map<string, number[]>();
    classTermResults.forEach(r => {
      const scores = studentAverages.get(r.studentId) || [];
      scores.push(Number(r.totalScore));
      studentAverages.set(r.studentId, scores);
    });

    const rankings = Array.from(studentAverages.entries())
      .map(([sid, scores]) => ({
        studentId: sid,
        average: scores.reduce((a, b) => a + b, 0) / scores.length,
      }))
      .sort((a, b) => b.average - a.average);

    const position = rankings.findIndex(r => r.studentId === studentId) + 1;
    const totalStudents = rankings.length;

    res.json({
      student,
      activeTerm,
      currentGrades: termResults,
      attendanceSummary,
      upcomingAssessments,
      recentResults,
      allTermResults,
      position: position || null,
      totalStudents,
    });
  } catch (error) {
    console.error('Get student academic dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch academic dashboard' });
  }
};

// Get grade trends over time for a student
export const getGradeTrends = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;

    // Authorization check
    if (userRole === 'PARENT') {
      const student = await prisma.student.findFirst({
        where: { id: studentId, parentId: userId }
      });
      if (!student) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const results = await prisma.termResult.findMany({
      where: { studentId },
      include: {
        subject: { select: { name: true, code: true } },
        term: { select: { name: true, startDate: true } },
      },
      orderBy: { term: { startDate: 'asc' } },
    });

    // Group by term for trend display
    const trendsByTerm = results.reduce((acc: any, r) => {
      const termName = r.term.name;
      if (!acc[termName]) {
        acc[termName] = { term: termName, startDate: r.term.startDate, subjects: {} };
      }
      acc[termName].subjects[r.subject.name] = Number(r.totalScore);
      return acc;
    }, {});

    // Calculate average per term
    Object.values(trendsByTerm).forEach((term: any) => {
      const scores = Object.values(term.subjects) as number[];
      term.average = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
    });

    res.json({
      trends: Object.values(trendsByTerm),
      subjects: [...new Set(results.map(r => r.subject.name))],
    });
  } catch (error) {
    console.error('Get grade trends error:', error);
    res.status(500).json({ error: 'Failed to fetch grade trends' });
  }
};

// Get class performance analytics
export const getClassAnalytics = async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const { termId } = req.query;

    if (!termId) {
      return res.status(400).json({ error: 'Term ID is required' });
    }

    // Get all term results for this class and term
    const results = await prisma.termResult.findMany({
      where: { classId, termId: termId as string },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
        subject: { select: { id: true, name: true } },
      },
    });

    // Subject averages
    const subjectScores = new Map<string, { name: string; scores: number[] }>();
    results.forEach(r => {
      const entry = subjectScores.get(r.subjectId) || { name: r.subject.name, scores: [] };
      entry.scores.push(Number(r.totalScore));
      subjectScores.set(r.subjectId, entry);
    });

    const subjectAverages = Array.from(subjectScores.entries()).map(([id, data]) => ({
      subjectId: id,
      subjectName: data.name,
      average: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length * 10) / 10,
      highest: Math.max(...data.scores),
      lowest: Math.min(...data.scores),
      studentCount: data.scores.length,
    }));

    // Student rankings
    const studentScores = new Map<string, { student: any; scores: number[] }>();
    results.forEach(r => {
      const entry = studentScores.get(r.studentId) || { student: r.student, scores: [] };
      entry.scores.push(Number(r.totalScore));
      studentScores.set(r.studentId, entry);
    });

    const studentRankings = Array.from(studentScores.entries())
      .map(([id, data]) => ({
        studentId: id,
        student: data.student,
        average: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length * 10) / 10,
        subjectCount: data.scores.length,
      }))
      .sort((a, b) => b.average - a.average)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    // Grade distribution
    const allScores = results.map(r => Number(r.totalScore));
    const gradeDistribution = {
      'A (80-100)': allScores.filter(s => s >= 80).length,
      'B (60-79)': allScores.filter(s => s >= 60 && s < 80).length,
      'C (40-59)': allScores.filter(s => s >= 40 && s < 60).length,
      'D (20-39)': allScores.filter(s => s >= 20 && s < 40).length,
      'E (0-19)': allScores.filter(s => s < 20).length,
    };

    // Class average
    const classAverage = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length * 10) / 10
      : 0;

    res.json({
      classAverage,
      subjectAverages,
      studentRankings,
      gradeDistribution,
      totalStudents: studentRankings.length,
    });
  } catch (error) {
    console.error('Get class analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch class analytics' });
  }
};
