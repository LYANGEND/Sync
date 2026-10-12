import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  AcademicScopeError,
  ensureAcademicClassAccess,
  ensureStudentRecordAccess,
} from '../utils/academicScope';
import { buildAverageRankMap } from '../utils/academicValidation';
import { runTermWriteTransaction, TermLifecycleError } from '../services/termLifecycleService';
import { sendTermLifecycleError } from '../utils/termLifecycleHttp';
import {
  getClassEnrollmentsForTerm,
  getStudentPlacementForTerm,
  StudentPlacementError,
} from '../services/studentPlacementService';
import { verifyReportSnapshotIntegrity } from '../utils/reportSnapshotIntegrity';
import { saveDraftReportRemarks } from '../services/academicRecordService';

type ReportClient = Prisma.TransactionClient | typeof prisma;

const studentTermSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
});

const classTermSchema = z.object({
  classId: z.string().uuid(),
  termId: z.string().uuid(),
});

const reportRemarksSchema = studentTermSchema.extend({
  classTeacherRemark: z.string().trim().max(2000).optional(),
  principalRemark: z.string().trim().max(2000).optional(),
});

const getClassTermStudentIds = async (classId: string, termId: string) => {
  const enrollments = await getClassEnrollmentsForTerm(classId, termId);
  return enrollments.map(enrollment => enrollment.studentId);
};

const getReportMetadata = (report: {
  term?: { startDate: Date; endDate: Date } | null;
  totalAttendance?: number | null;
  totalDays?: number | null;
} | null) => {
  const startYear = report?.term?.startDate.getUTCFullYear();
  const endYear = report?.term?.endDate.getUTCFullYear();
  const academicYear = startYear
    ? (endYear && endYear !== startYear ? `${startYear}/${endYear}` : String(startYear))
    : undefined;
  const attendancePercentage = report?.totalDays
    ? ((report.totalAttendance || 0) / report.totalDays) * 100
    : 0;

  return { academicYear, attendancePercentage };
};

export const generateStudentReport = async (req: Request, res: Response) => {
  try {
    const { studentId, termId } = studentTermSchema.parse(req.body);
    await ensureStudentRecordAccess(req as AuthRequest, studentId, { academicTermId: termId });

    await runTermWriteTransaction(termId, 'FINALIZATION', tx => (
      generateSingleStudentReport(studentId, termId, tx)
    ));

    // Fetch School Settings
    const settings = await prisma.schoolSettings.findFirst();

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

    if (!report) {
      return res.status(500).json({ error: 'Generated report could not be loaded' });
    }

    const [results, classResults] = await Promise.all([
      prisma.termResult.findMany({
        where: { studentId, termId, classId: report.classId },
        include: { subject: true },
      }),
      prisma.termResult.findMany({
        where: { classId: report.classId, termId },
        select: { studentId: true, totalScore: true },
      }),
    ]);

    // Calculate average
    const totalScore = results.reduce((sum, r) => sum + Number(r.totalScore), 0);
    const averageScore = results.length > 0 ? totalScore / results.length : 0;

    res.json({
      ...report,
      ...getReportMetadata(report),
      results: results.map(r => ({
        ...r,
        totalScore: Number(r.totalScore),
        subjectName: r.subject?.name || 'Unknown Subject'
      })),
      totalScore,
      averageScore,
      rank: buildAverageRankMap(classResults).get(studentId),
      school: settings
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof StudentPlacementError) {
      return res.status(error.status).json({ code: error.code, error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Generate report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
};

export const getStudentReport = async (req: Request, res: Response) => {
  try {
    const { studentId, termId } = studentTermSchema.parse({
      studentId: req.query.studentId,
      termId: req.query.termId,
    });
    await ensureStudentRecordAccess(req as AuthRequest, studentId, { academicTermId: termId });

    const settings = await prisma.schoolSettings.findFirst();

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

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const [results, classResults] = await Promise.all([
      prisma.termResult.findMany({
        where: { studentId, termId, classId: report.classId },
        include: { subject: true },
      }),
      prisma.termResult.findMany({
        where: { classId: report.classId, termId },
        select: { studentId: true, totalScore: true },
      }),
    ]);

    // Calculate average
    const totalScore = results.reduce((sum, r) => sum + Number(r.totalScore), 0);
    const averageScore = results.length > 0 ? totalScore / results.length : 0;

    res.json({
      ...report,
      ...getReportMetadata(report),
      results: results.map(r => ({
        ...r,
        totalScore: Number(r.totalScore),
        subjectName: r.subject?.name || 'Unknown Subject'
      })),
      totalScore,
      averageScore,
      rank: buildAverageRankMap(classResults).get(studentId),
      school: settings
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to fetch report' });
  }
};

export const getClassReports = async (req: Request, res: Response) => {
  try {
    const { classId, termId } = classTermSchema.parse({
      classId: req.query.classId,
      termId: req.query.termId,
    });
    const classInfo = await ensureAcademicClassAccess(req as AuthRequest, classId, {
      academicTermId: termId,
    });
    const settings = await prisma.schoolSettings.findFirst();

    // 1. Resolve both current and historical members of this term-owned class.
    const studentIds = await getClassTermStudentIds(classId, termId);
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      orderBy: { lastName: 'asc' }
    });

    const reports = [];

    // 2. Fetch report for each student in bulk.
    const termReports = await prisma.studentTermReport.findMany({
      where: {
        studentId: { in: studentIds },
        termId,
        classId,
      },
      include: {
        term: true
      }
    });

    const allResults = await prisma.termResult.findMany({
      where: {
        studentId: { in: studentIds },
        termId,
        classId,
      },
      include: {
        subject: true
      }
    });

    const reportMap = new Map(termReports.map((report) => [report.studentId, report]));
    const rankMap = buildAverageRankMap(allResults);
    const resultsMap = new Map<string, typeof allResults>();
    allResults.forEach((result) => {
      const studentResults = resultsMap.get(result.studentId) || [];
      studentResults.push(result);
      resultsMap.set(result.studentId, studentResults);
    });

    // 3. Assemble data
    for (const student of students) {
      const report = reportMap.get(student.id);
      const results = resultsMap.get(student.id) || [];

      if (report) {
        const totalScore = results.reduce((sum, r) => sum + Number(r.totalScore), 0);
        const averageScore = results.length > 0 ? totalScore / results.length : 0;

        reports.push({
          ...report,
          ...getReportMetadata(report),
          student,
          class: classInfo,
          results: results.map(r => ({
            ...r,
            totalScore: Number(r.totalScore),
            subjectName: r.subject?.name || 'Unknown Subject'
          })),
          totalScore,
          averageScore,
          rank: rankMap.get(student.id),
          school: settings,
        });
      }
    }

    res.json(reports);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Get class reports error:', error);
    res.status(500).json({ error: 'Failed to fetch class reports' });
  }
};

export const generateClassReports = async (req: Request, res: Response) => {
  // Bulk generation for a whole class
  try {
    const { classId, termId } = classTermSchema.parse(req.body);
    const classInfo = await ensureAcademicClassAccess(req as AuthRequest, classId, {
      academicTermId: termId,
    });

    const studentIds = await getClassTermStudentIds(classId, termId);
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
    });

    const count = await runTermWriteTransaction(termId, 'FINALIZATION', async tx => {
      let generatedCount = 0;
      for (const student of students) {
        await generateSingleStudentReport(student.id, termId, tx);
        generatedCount++;
      }
      return generatedCount;
    });

    res.json({ count, message: `Generated reports for ${count} students` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Batch generation error:', error);
    res.status(500).json({ error: 'Failed to generate class reports' });
  }
};

// Helper function to avoid code duplication
export const generateSingleStudentReport = async (
  studentId: string,
  termId: string,
  client: ReportClient,
) => {
  // 0. Fetch Term for dates
  const term = await client.academicTerm.findUnique({
    where: { id: termId }
  });
  if (!term) throw new AcademicScopeError(404, 'Academic term not found');

  // 1. Resolve the student's class exclusively from the authoritative term placement.
  const placement = await getStudentPlacementForTerm(studentId, termId, client);
  if (!placement) {
    throw new AcademicScopeError(400, 'Student has no placement in the selected academic term');
  }
  const classId = placement.classId;

  const [existingReport, historicalResults, attendanceClasses, assessmentClasses] = await Promise.all([
    client.studentTermReport.findUnique({
      where: { studentId_termId: { studentId, termId } },
      select: { classId: true, status: true },
    }),
    client.termResult.findMany({
      where: { studentId, termId },
      select: { classId: true },
      distinct: ['classId'],
    }),
    client.attendance.findMany({
      where: { studentId, academicTermId: termId },
      select: { classId: true },
      distinct: ['classId'],
    }),
    client.assessmentResult.findMany({
      where: { studentId, assessment: { termId } },
      select: { assessment: { select: { classId: true } } },
      distinct: ['assessmentId'],
    }),
  ]);

  const evidencedClassIds = new Set<string>();
  if (existingReport) evidencedClassIds.add(existingReport.classId);
  historicalResults.forEach((result) => evidencedClassIds.add(result.classId));
  attendanceClasses.forEach((record) => evidencedClassIds.add(record.classId));
  assessmentClasses.forEach((result) => evidencedClassIds.add(result.assessment.classId));
  const conflictingClassId = [...evidencedClassIds].find(id => id !== classId);
  if (conflictingClassId) {
    throw new AcademicScopeError(409, 'Historical academic records conflict with the authoritative term placement');
  }
  if (existingReport && existingReport.status !== 'DRAFT') {
    throw new AcademicScopeError(409, 'Finalized and published reports cannot be regenerated');
  }

  // 2. Fetch all assessments for this class and term
  const assessments = await client.assessment.findMany({
    where: {
      classId,
      termId: termId
    },
    include: {
      results: {
        where: { studentId }
      }
    }
  });

  // 3. Fetch Grading Scales
  const gradingScales = await client.gradingScale.findMany({
    orderBy: { minScore: 'desc' }
  });

  // 4. Calculate Subject Grades
  const subjectAssessments: Record<string, typeof assessments> = {};
  assessments.forEach(a => {
    if (!subjectAssessments[a.subjectId]) subjectAssessments[a.subjectId] = [];
    subjectAssessments[a.subjectId].push(a);
  });

  const assessedSubjectIds = Object.keys(subjectAssessments);
  await client.termResult.deleteMany({
    where: {
      studentId,
      termId,
      classId,
      ...(assessedSubjectIds.length > 0
        ? { subjectId: { notIn: assessedSubjectIds } }
        : {}),
    },
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

    await client.termResult.upsert({
      where: {
        studentId_subjectId_termId: {
          studentId,
          subjectId,
          termId
        }
      },
      update: {
        classId,
        totalScore: finalScore,
        grade: gradeScale?.grade || 'N/A',
        remarks: gradeScale?.remark
      },
      create: {
        studentId,
        subjectId,
        termId,
        classId,
        totalScore: finalScore,
        grade: gradeScale?.grade || 'N/A',
        remarks: gradeScale?.remark
      }
    });
  }

  // 5. Calculate Attendance
  const eligibleStart = placement.startsAt > term.startDate ? placement.startsAt : term.startDate;
  const placementEnd = placement.endsAt ?? term.endDate;
  const eligibleEnd = placementEnd < term.endDate ? placementEnd : term.endDate;
  const instructionalDays = eligibleEnd >= eligibleStart
    ? await client.termInstructionalDay.findMany({
      where: {
        academicTermId: termId,
        isInstructional: true,
        date: { gte: eligibleStart, lte: eligibleEnd },
      },
      select: { date: true },
    })
    : [];
  const eligibleDayKeys = new Set(instructionalDays.map(day => day.date.toISOString().slice(0, 10)));
  const attendanceRecords = await client.attendance.findMany({
    where: {
      studentId,
      classId,
      academicTermId: termId,
      date: {
        gte: eligibleStart,
        lte: eligibleEnd,
      },
    },
    select: { date: true, status: true },
  });
  const attendedDayKeys = new Set(
    attendanceRecords
      .filter(record => record.status === 'PRESENT' || record.status === 'LATE')
      .map(record => record.date.toISOString().slice(0, 10))
      .filter(day => eligibleDayKeys.has(day)),
  );
  const attendanceCount = attendedDayKeys.size;
  const totalDays = instructionalDays.length;

  // 6. Create/Update Report Card
  await client.studentTermReport.upsert({
    where: {
      studentId_termId: {
        studentId,
        termId
      }
    },
    update: {
      classId,
      totalAttendance: attendanceCount,
      totalDays: totalDays,
    },
    create: {
      studentId,
      termId,
      classId,
      totalAttendance: attendanceCount,
      totalDays: totalDays,
    }
  });
};

export const updateReportRemarks = async (req: Request, res: Response) => {
  try {
    const input = reportRemarksSchema.parse(req.body);
    const report = await saveDraftReportRemarks(req as AuthRequest, input);
    res.json(report);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message, ...(error.status === 409 ? { code: 'REPORT_LOCKED' } : {}) });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Update remarks error:', error);
    res.status(500).json({ error: 'Failed to update remarks' });
  }
};

export const verifyReport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const report = await prisma.studentTermReport.findUnique({
      where: { id },
      select: { id: true, status: true, currentVersion: true },
    });

    if (!report || report.status !== 'PUBLISHED') {
      return res.status(404).json({ valid: false, message: 'Published report not found' });
    }

    const version = await prisma.studentTermReportVersion.findUnique({
      where: {
        reportId_version: { reportId: report.id, version: report.currentVersion },
      },
    });
    const snapshot = version?.snapshot as any;
    const publishedReport = snapshot?.report;
    if (!version
      || version.status !== 'PUBLISHED'
      || !publishedReport
      || !verifyReportSnapshotIntegrity(snapshot)) {
      return res.status(409).json({
        valid: false,
        message: 'Published report evidence is incomplete or failed its integrity check',
      });
    }

    res.json({
      valid: true,
      studentName: `${publishedReport.student.firstName} ${publishedReport.student.lastName}`,
      admissionNumber: publishedReport.student.admissionNumber,
      className: publishedReport.class.name,
      term: publishedReport.term.name,
      averageScore: publishedReport.averageScore,
      schoolName: publishedReport.school?.schoolName || 'Sync School System',
      version: version.version,
      checksum: snapshot.integrity?.checksum,
      generatedAt: version.createdAt,
    });
  } catch (error) {
    console.error('Verify report error:', error);
    res.status(500).json({ valid: false, error: 'Verification failed' });
  }
};
