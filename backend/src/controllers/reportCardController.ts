import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId } from '../utils/tenantContext';

const prisma = new PrismaClient();

export const generateStudentReport = async (req: TenantRequest, res: Response) => {
  try {
    const { studentId, termId } = req.body;
    const tenantId = getTenantId(req);

    // Verify student belongs to tenant
    const studentExists = await prisma.student.findFirst({
      where: { id: studentId, tenantId }
    });
    if (!studentExists) {
      return res.status(404).json({ error: 'Student not found in this tenant' });
    }

    await generateSingleStudentReport(studentId, termId, tenantId);

    // Fetch Tenant Settings (for school info)
    // resolveTenant middleware populates req.tenant
    const schoolSettings = req.tenant;

    // Fetch the generated report to return it
    const report = await prisma.studentTermReport.findUnique({
      where: {
        studentId_termId: {
          studentId,
          termId
        }
      },
      include: {
        student: true,
        class: true,
        term: true
      }
    });

    const results = await prisma.termResult.findMany({
      where: {
        studentId,
        termId
      },
      include: {
        subject: true
      }
    });

    // Calculate average
    const totalScore = results.reduce((sum, r) => sum + Number(r.totalScore), 0);
    const averageScore = results.length > 0 ? totalScore / results.length : 0;

    res.json({
      ...report,
      results: results.map(r => ({
        ...r,
        totalScore: Number(r.totalScore),
        subjectName: r.subject?.name || 'Unknown Subject'
      })),
      totalScore,
      averageScore,
      school: schoolSettings
    });

  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
};

export const getStudentReport = async (req: TenantRequest, res: Response) => {
  try {
    const { studentId, termId } = req.query;
    const tenantId = getTenantId(req);

    if (!studentId || !termId) {
      return res.status(400).json({ error: 'Student ID and Term ID are required' });
    }

    // Verify student ownership
    const student = await prisma.student.findFirst({
      where: { id: String(studentId), tenantId }
    });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Fetch Tenant Settings
    const schoolSettings = req.tenant;

    const report = await prisma.studentTermReport.findUnique({
      where: {
        studentId_termId: {
          studentId: String(studentId),
          termId: String(termId)
        }
      },
      include: {
        student: true,
        class: true,
        term: true
      }
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const results = await prisma.termResult.findMany({
      where: {
        studentId: String(studentId),
        termId: String(termId)
      },
      include: {
        subject: true
      }
    });

    // Calculate average
    const totalScore = results.reduce((sum, r) => sum + Number(r.totalScore), 0);
    const averageScore = results.length > 0 ? totalScore / results.length : 0;

    res.json({
      ...report,
      results: results.map(r => ({
        ...r,
        totalScore: Number(r.totalScore),
        subjectName: r.subject?.name || 'Unknown Subject'
      })),
      totalScore,
      averageScore,
      school: schoolSettings
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch report' });
  }
};

export const getClassReports = async (req: TenantRequest, res: Response) => {
  try {
    const { classId, termId } = req.query;
    const tenantId = getTenantId(req);

    if (!classId || !termId) {
      return res.status(400).json({ error: 'Class ID and Term ID are required' });
    }

    // Verify class ownership
    const classExists = await prisma.class.findFirst({
      where: { id: String(classId), tenantId }
    });
    if (!classExists) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // 1. Get all students in class (tenant scoped by class, but safe to add tenantId check)
    const students = await prisma.student.findMany({
      where: {
        classId: String(classId),
        tenantId,
        status: 'ACTIVE'
      },
      include: {
        class: true,
      },
      orderBy: { lastName: 'asc' }
    });

    const reports = [];

    // 2. Fetch report for each student
    // Optimized: Fetch all reports and results in bulk
    const studentIds = students.map(s => s.id);

    const termReports = await prisma.studentTermReport.findMany({
      where: {
        studentId: { in: studentIds },
        termId: String(termId)
      },
      include: {
        term: true
      }
    });

    const allResults = await prisma.termResult.findMany({
      where: {
        studentId: { in: studentIds },
        termId: String(termId)
      },
      include: {
        subject: true
      }
    });

    // 3. Assemble data
    for (const student of students) {
      const report = termReports.find(r => r.studentId === student.id);
      const results = allResults.filter(r => r.studentId === student.id);

      if (report) {
        const totalScore = results.reduce((sum, r) => sum + Number(r.totalScore), 0);
        const averageScore = results.length > 0 ? totalScore / results.length : 0;

        reports.push({
          ...report,
          student,
          class: student.class,
          results: results.map(r => ({
            ...r,
            totalScore: Number(r.totalScore),
            subjectName: r.subject?.name || 'Unknown Subject'
          })),
          totalScore,
          averageScore
        });
      }
    }

    res.json(reports);
  } catch (error) {
    console.error('Get class reports error:', error);
    res.status(500).json({ error: 'Failed to fetch class reports' });
  }
};

export const generateClassReports = async (req: TenantRequest, res: Response) => {
  // Bulk generation for a whole class
  try {
    const { classId, termId } = req.body;
    const tenantId = getTenantId(req);

    // Verify class ownership
    const classExists = await prisma.class.findFirst({
      where: { id: classId, tenantId }
    });
    if (!classExists) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const students = await prisma.student.findMany({
      where: { classId, tenantId, status: 'ACTIVE' }
    });

    let count = 0;
    for (const student of students) {
      // Pass tenantId to helper
      await generateSingleStudentReport(student.id, termId, tenantId);
      count++;
    }

    res.json({ count, message: `Generated reports for ${count} students` });
  } catch (error) {
    console.error('Batch generation error:', error);
    res.status(500).json({ error: 'Failed to generate class reports' });
  }
};

// Helper function to avoid code duplication
const generateSingleStudentReport = async (studentId: string, termId: string, tenantId: string) => {
  // 0. Fetch Term for dates - Verify tenant ownership implicitly via subsequent queries or Explicitly?
  // Term should belong to tenant.
  const term = await prisma.academicTerm.findFirst({
    where: { id: termId, tenantId }
  });
  if (!term) return;

  // 1. Fetch Student and Class
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId },
    include: { class: true }
  });

  if (!student) return;

  // 2. Fetch all assessments for this class and term
  const assessments = await prisma.assessment.findMany({
    where: {
      classId: student.classId,
      termId: termId,
      tenantId // Ensure assessments belong to tenant
    },
    include: {
      results: {
        where: { studentId }
      }
    }
  });

  // 3. Fetch Grading Scales
  const gradingScales = await prisma.gradingScale.findMany({
    where: { tenantId }, // Filter by tenant
    orderBy: { minScore: 'desc' }
  });

  // 4. Calculate Subject Grades
  const subjectAssessments: Record<string, typeof assessments> = {};
  assessments.forEach(a => {
    if (!subjectAssessments[a.subjectId]) subjectAssessments[a.subjectId] = [];
    subjectAssessments[a.subjectId].push(a);
  });

  for (const subjectId in subjectAssessments) {
    const subjectAssmts = subjectAssessments[subjectId];
    let totalWeightedScore = 0;

    subjectAssmts.forEach(assessment => {
      const result = assessment.results[0];
      if (result) {
        const scorePercent = (Number(result.score) / Number(assessment.totalMarks));
        const weight = Number(assessment.weight);
        totalWeightedScore += scorePercent * weight;
      }
    });

    const finalScore = Math.round(totalWeightedScore);
    const gradeScale = gradingScales.find(g => finalScore >= g.minScore && finalScore <= g.maxScore);

    await prisma.termResult.upsert({
      where: {
        studentId_subjectId_termId: {
          studentId,
          subjectId,
          termId
        }
      },
      update: {
        totalScore: finalScore,
        grade: gradeScale?.grade || 'N/A',
        remarks: gradeScale?.remark
      },
      create: {
        studentId,
        subjectId,
        termId,
        classId: student.classId,
        totalScore: finalScore,
        grade: gradeScale?.grade || 'N/A',
        remarks: gradeScale?.remark
      }
    });
  }

  // 5. Calculate Attendance
  const attendanceCount = await prisma.attendance.count({
    where: {
      studentId,
      tenantId, // Filter by tenant (if model has it)
      date: {
        gte: term.startDate,
        lte: term.endDate
      },
      status: { in: ['PRESENT', 'LATE'] }
    }
  });

  const schoolDays = await prisma.attendance.groupBy({
    by: ['date'],
    where: {
      classId: student.classId,
      tenantId, // Filter by tenant
      date: {
        gte: term.startDate,
        lte: term.endDate
      }
    }
  });
  const totalDays = schoolDays.length > 0 ? schoolDays.length : 60;

  // 6. Create/Update Report Card
  await prisma.studentTermReport.upsert({
    where: {
      studentId_termId: {
        studentId,
        termId
      }
    },
    update: {
      classId: student.classId,
      totalAttendance: attendanceCount,
      totalDays: totalDays,
    },
    create: {
      studentId,
      termId,
      classId: student.classId,
      totalAttendance: attendanceCount,
      totalDays: totalDays,
    }
  });
};

export const updateReportRemarks = async (req: TenantRequest, res: Response) => {
  try {
    const { studentId, termId, classTeacherRemark, principalRemark } = req.body;
    const tenantId = getTenantId(req);

    // Verify student ownership
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId }
    });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const report = await prisma.studentTermReport.update({
      where: {
        studentId_termId: {
          studentId,
          termId
        }
      },
      data: {
        classTeacherRemark,
        principalRemark
      }
    });

    res.json(report);
  } catch (error) {
    console.error('Update remarks error:', error);
    res.status(500).json({ error: 'Failed to update remarks' });
  }
};
