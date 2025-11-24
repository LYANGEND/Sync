import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Helper function to generate a single report
const generateSingleStudentReportHelper = async (studentId: string, termId: string, schoolId: string) => {
    // 1. Fetch Student and Class
    const student = await prisma.student.findFirst({
      where: { 
        id: studentId,
        schoolId: schoolId
      },
      include: { class: true }
    });

    if (!student) return;

    // 2. Fetch all assessments for this class and term
    const assessments = await prisma.assessment.findMany({
      where: {
        classId: student.classId,
        termId: termId,
        class: {
            schoolId: schoolId
        }
      },
      include: {
        results: {
          where: { studentId }
        }
      }
    });

    // 3. Fetch Grading Scales
    const gradingScales = await prisma.gradingScale.findMany({
      where: { schoolId: schoolId },
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

    // 5. Create/Update Report Card
    await prisma.studentTermReport.upsert({
      where: {
        studentId_termId: {
          studentId,
          termId
        }
      },
      update: {
        classId: student.classId,
      },
      create: {
        studentId,
        termId,
        classId: student.classId,
        totalAttendance: 0, // Placeholder
        totalDays: 60, // Placeholder
      }
    });
};

export const generateStudentReport = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { studentId, termId } = req.body;
    
    if (!studentId || !termId) {
        return res.status(400).json({ message: 'Student ID and Term ID are required' });
    }

    await generateSingleStudentReportHelper(studentId, termId, req.school.id);

    // Fetch the generated report to return it
    const report = await prisma.studentTermReport.findFirst({
      where: {
        studentId,
        termId,
        student: {
            schoolId: req.school.id
        }
      },
      include: {
        student: true,
        class: true,
        term: true
      }
    });

    if (!report) {
        return res.status(404).json({ message: 'Report could not be generated' });
    }

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
      averageScore
    });

  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
};

export const getStudentReport = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { studentId, termId } = req.query;

    if (!studentId || !termId) {
      return res.status(400).json({ error: 'Student ID and Term ID are required' });
    }

    const report = await prisma.studentTermReport.findFirst({
      where: {
        studentId: String(studentId),
        termId: String(termId),
        student: {
            schoolId: req.school.id
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
      averageScore
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch report' });
  }
};

export const generateClassReports = async (req: Request, res: Response) => {
  // Bulk generation for a whole class
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { classId, termId } = req.body;
    
    const students = await prisma.student.findMany({
      where: { 
        classId, 
        status: 'ACTIVE',
        schoolId: req.school.id
      }
    });

    let count = 0;
    for (const student of students) {
      await generateSingleStudentReportHelper(student.id, termId, req.school.id);
      count++;
    }
    
    res.json({ count, message: `Generated reports for ${count} students` });
  } catch (error) {
    console.error('Batch generation error:', error);
    res.status(500).json({ error: 'Failed to generate class reports' });
  }
};

export const updateReportRemarks = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { studentId, termId, classTeacherRemark, principalRemark } = req.body;

    // Verify student belongs to school
    const student = await prisma.student.findFirst({
        where: {
            id: studentId,
            schoolId: req.school.id
        }
    });

    if (!student) {
        return res.status(404).json({ message: 'Student not found' });
    }

    const report = await prisma.studentTermReport.updateMany({
      where: {
        studentId,
        termId
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
