import { prisma } from '../utils/prisma';
import aiService from './aiService';

interface RiskFactors {
  academic: { score: number; details: string };
  attendance: { score: number; details: string };
  financial: { score: number; details: string };
  trend: { score: number; details: string };
}

interface RiskAssessment {
  studentId: string;
  studentName: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskScore: number;
  factors: RiskFactors;
  recommendations: string[];
}

/**
 * Student Risk Engine - Identifies at-risk students using multi-factor analysis
 * Combines academic performance, attendance, financial status, and trends
 */
class StudentRiskService {

  /**
   * Assess risk for all active students in a class
   */
  async assessClass(classId: string, termId: string): Promise<RiskAssessment[]> {
    const students = await prisma.student.findMany({
      where: { classId, status: 'ACTIVE' },
      include: {
        termResults: { where: { termId } },
        attendance: true,
        feeStructures: true,
        parent: { select: { email: true } },
      },
    });

    const assessments: RiskAssessment[] = [];

    for (const student of students) {
      const assessment = await this.assessStudent(student, termId);
      assessments.push(assessment);
    }

    // Sort by risk score descending (highest risk first)
    assessments.sort((a, b) => b.riskScore - a.riskScore);
    return assessments;
  }

  /**
   * Assess risk for a single student
   */
  async assessStudent(studentOrId: any, termId: string): Promise<RiskAssessment> {
    let student = studentOrId;

    // If passed a string ID, fetch the student
    if (typeof studentOrId === 'string') {
      student = await prisma.student.findUnique({
        where: { id: studentOrId },
        include: {
          termResults: { where: { termId } },
          attendance: true,
          feeStructures: true,
          parent: { select: { email: true } },
        },
      });

      if (!student) throw new Error('Student not found');
    }

    // 1. Academic Factor (40% weight)
    const academicFactor = this.calculateAcademicRisk(student);

    // 2. Attendance Factor (30% weight)
    const attendanceFactor = await this.calculateAttendanceRisk(student.id, termId);

    // 3. Financial Factor (20% weight)
    const financialFactor = this.calculateFinancialRisk(student);

    // 4. Trend Factor (10% weight)
    const trendFactor = await this.calculateTrendRisk(student.id);

    // Weighted risk score (0-100, higher = more at risk)
    const riskScore = Math.min(100, Math.round(
      academicFactor.score * 0.40 +
      attendanceFactor.score * 0.30 +
      financialFactor.score * 0.20 +
      trendFactor.score * 0.10
    ));

    const riskLevel = this.getRiskLevel(riskScore);

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      academic: academicFactor,
      attendance: attendanceFactor,
      financial: financialFactor,
      trend: trendFactor,
    });

    // Save to database
    await this.saveAssessment(student.id, termId, {
      riskLevel,
      riskScore,
      factors: {
        academic: academicFactor,
        attendance: attendanceFactor,
        financial: financialFactor,
        trend: trendFactor,
      },
      recommendations,
    });

    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      riskLevel,
      riskScore,
      factors: {
        academic: academicFactor,
        attendance: attendanceFactor,
        financial: financialFactor,
        trend: trendFactor,
      },
      recommendations,
    };
  }

  /**
   * Get all at-risk students across the school
   */
  async getAtRiskStudents(termId: string, minRiskLevel: string = 'MEDIUM'): Promise<any[]> {
    const riskLevels = ['MEDIUM', 'HIGH', 'CRITICAL'];
    const index = riskLevels.indexOf(minRiskLevel);
    const targetLevels = index >= 0 ? riskLevels.slice(index) : riskLevels;

    const assessments = await (prisma as any).studentRiskAssessment.findMany({
      where: {
        termId,
        riskLevel: { in: targetLevels },
      },
      orderBy: { riskScore: 'desc' },
    });

    // Enrich with student info
    const studentIds = assessments.map((a: any) => a.studentId);
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: {
        class: true,
        parent: { select: { fullName: true, email: true } },
      },
    });

    const studentMap = new Map(students.map(s => [s.id, s]));

    return assessments.map((a: any) => ({
      ...a,
      student: studentMap.get(a.studentId),
      riskScore: Number(a.riskScore),
    }));
  }

  /**
   * Generate AI-enhanced recommendations for high-risk students
   */
  async getAIRecommendations(studentId: string, termId: string): Promise<string[]> {
    const isAIAvailable = await aiService.isAvailable();
    if (!isAIAvailable) return this.generateRecommendations({} as any);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        termResults: { where: { termId }, include: { subject: true } },
        class: true,
      },
    });

    if (!student) return [];

    const attendanceData = await this.calculateAttendanceRisk(studentId, termId);
    const subjects = student.termResults.map(r => ({
      name: r.subject.name,
      score: Number(r.totalScore),
      grade: r.grade,
    }));

    const prompt = `You are an educational advisor for a Zambian school. Analyze this student's data and provide 5 specific, actionable recommendations:

Student: ${student.firstName} ${student.lastName}
Grade/Class: ${student.class.name}
Subjects: ${JSON.stringify(subjects)}
Attendance Rate: ${100 - attendanceData.score}%
Attendance Details: ${attendanceData.details}

Provide recommendations as a JSON array of strings. Focus on practical interventions the school and parents can implement. Consider the Zambian educational context.`;

    try {
      const recommendations = await aiService.generateJSON<string[]>(prompt);
      return recommendations;
    } catch {
      return this.generateRecommendations({} as any);
    }
  }

  // ==========================================
  // Private calculation methods
  // ==========================================

  private calculateAcademicRisk(student: any): { score: number; details: string } {
    const results = student.termResults || [];
    if (results.length === 0) {
      return { score: 50, details: 'No academic results available for assessment' };
    }

    const scores = results.map((r: any) => Number(r.totalScore));
    const avgScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
    const failingSubjects = scores.filter((s: number) => s < 50).length;

    // Risk score: 100 = worst, 0 = best
    let riskScore = Math.max(0, 100 - avgScore);

    // Boost risk if multiple failing subjects
    if (failingSubjects >= 3) riskScore = Math.min(100, riskScore + 20);
    else if (failingSubjects >= 1) riskScore = Math.min(100, riskScore + 10);

    const details = `Average: ${avgScore.toFixed(1)}%, Failing: ${failingSubjects}/${results.length} subjects`;
    return { score: Math.round(riskScore), details };
  }

  private async calculateAttendanceRisk(studentId: string, termId: string): Promise<{ score: number; details: string }> {
    const term = await prisma.academicTerm.findUnique({ where: { id: termId } });
    if (!term) return { score: 30, details: 'Term not found' };

    const totalRecords = await prisma.attendance.count({
      where: {
        studentId,
        date: { gte: term.startDate, lte: term.endDate },
      },
    });

    if (totalRecords === 0) {
      return { score: 40, details: 'No attendance records' };
    }

    const absentCount = await prisma.attendance.count({
      where: {
        studentId,
        date: { gte: term.startDate, lte: term.endDate },
        status: 'ABSENT',
      },
    });

    const lateCount = await prisma.attendance.count({
      where: {
        studentId,
        date: { gte: term.startDate, lte: term.endDate },
        status: 'LATE',
      },
    });

    const absentRate = (absentCount / totalRecords) * 100;
    const lateRate = (lateCount / totalRecords) * 100;

    // Risk calculation
    let riskScore = absentRate * 2 + lateRate * 0.5;
    riskScore = Math.min(100, Math.round(riskScore));

    const attendanceRate = ((totalRecords - absentCount) / totalRecords * 100).toFixed(1);
    const details = `Attendance: ${attendanceRate}%, Absent: ${absentCount} days, Late: ${lateCount} days`;
    return { score: riskScore, details };
  }

  private calculateFinancialRisk(student: any): { score: number; details: string } {
    const fees = student.feeStructures || [];
    if (fees.length === 0) {
      return { score: 0, details: 'No fees assigned' };
    }

    const totalDue = fees.reduce((sum: number, f: any) => sum + Number(f.amountDue), 0);
    const totalPaid = fees.reduce((sum: number, f: any) => sum + Number(f.amountPaid), 0);

    if (totalDue === 0) return { score: 0, details: 'No fees due' };

    const paidPercentage = (totalPaid / totalDue) * 100;
    const outstanding = totalDue - totalPaid;

    // Higher risk for more outstanding fees
    let riskScore = Math.max(0, 100 - paidPercentage);

    const details = `Paid: ${paidPercentage.toFixed(0)}%, Outstanding: ZMW ${outstanding.toLocaleString()}`;
    return { score: Math.round(riskScore), details };
  }

  private async calculateTrendRisk(studentId: string): Promise<{ score: number; details: string }> {
    // Compare last 2 terms of performance
    const allResults = await prisma.termResult.findMany({
      where: { studentId },
      include: { term: true },
      orderBy: { term: { startDate: 'desc' } },
    });

    if (allResults.length < 2) {
      return { score: 30, details: 'Insufficient data for trend analysis' };
    }

    // Group by term
    const termGroups = new Map<string, number[]>();
    allResults.forEach(r => {
      const termId = r.termId;
      if (!termGroups.has(termId)) termGroups.set(termId, []);
      termGroups.get(termId)!.push(Number(r.totalScore));
    });

    const termAverages = Array.from(termGroups.entries()).map(([, scores]) => {
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    });

    if (termAverages.length < 2) {
      return { score: 30, details: 'Insufficient term data' };
    }

    const currentAvg = termAverages[0];
    const previousAvg = termAverages[1];
    const change = currentAvg - previousAvg;

    // Declining performance increases risk
    let riskScore = 30; // baseline
    if (change < -15) riskScore = 80;
    else if (change < -10) riskScore = 65;
    else if (change < -5) riskScore = 50;
    else if (change < 0) riskScore = 40;
    else if (change > 5) riskScore = 15;
    else if (change > 0) riskScore = 25;

    const direction = change >= 0 ? 'improving' : 'declining';
    const details = `Performance ${direction}: ${change >= 0 ? '+' : ''}${change.toFixed(1)}% (${previousAvg.toFixed(1)}% → ${currentAvg.toFixed(1)}%)`;
    return { score: riskScore, details };
  }

  private getRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (score >= 75) return 'CRITICAL';
    if (score >= 55) return 'HIGH';
    if (score >= 35) return 'MEDIUM';
    return 'LOW';
  }

  private generateRecommendations(factors: RiskFactors): string[] {
    const recs: string[] = [];

    if (factors.academic?.score >= 50) {
      recs.push('Schedule extra tutoring sessions for struggling subjects');
      recs.push('Assign study buddy from high-performing peers');
    }

    if (factors.attendance?.score >= 50) {
      recs.push('Contact parent/guardian about attendance concerns');
      recs.push('Investigate potential barriers to attendance (transport, health, etc.)');
    }

    if (factors.financial?.score >= 50) {
      recs.push('Consider student for scholarship or fee waiver program');
      recs.push('Offer a structured payment plan to the family');
    }

    if (factors.trend?.score >= 50) {
      recs.push('Monitor student closely over the next 2 weeks');
      recs.push('Schedule one-on-one meeting with class teacher');
    }

    if (recs.length === 0) {
      recs.push('Continue monitoring student progress');
      recs.push('Maintain regular communication with parents');
    }

    return recs;
  }

  private async saveAssessment(studentId: string, termId: string, data: any) {
    try {
      await (prisma as any).studentRiskAssessment.upsert({
        where: { studentId_termId: { studentId, termId } },
        update: {
          riskLevel: data.riskLevel,
          riskScore: data.riskScore,
          academicScore: data.factors.academic.score,
          attendanceScore: data.factors.attendance.score,
          financialScore: data.factors.financial.score,
          trendScore: data.factors.trend.score,
          factors: data.factors,
          recommendations: data.recommendations,
        },
        create: {
          studentId,
          termId,
          riskLevel: data.riskLevel,
          riskScore: data.riskScore,
          academicScore: data.factors.academic.score,
          attendanceScore: data.factors.attendance.score,
          financialScore: data.factors.financial.score,
          trendScore: data.factors.trend.score,
          factors: data.factors,
          recommendations: data.recommendations,
        },
      });
    } catch (err) {
      console.error('Failed to save risk assessment:', err);
    }
  }
}

export const studentRiskService = new StudentRiskService();
export default studentRiskService;
