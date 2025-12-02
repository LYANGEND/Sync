"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateReportRemarks = exports.generateClassReports = exports.getStudentReport = exports.generateStudentReport = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const generateStudentReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId, termId } = req.body;
        yield generateSingleStudentReport(studentId, termId);
        // Fetch the generated report to return it
        const report = yield prisma.studentTermReport.findUnique({
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
        const results = yield prisma.termResult.findMany({
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
        res.json(Object.assign(Object.assign({}, report), { results: results.map(r => {
                var _a;
                return (Object.assign(Object.assign({}, r), { totalScore: Number(r.totalScore), subjectName: ((_a = r.subject) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown Subject' }));
            }), totalScore,
            averageScore }));
    }
    catch (error) {
        console.error('Generate report error:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});
exports.generateStudentReport = generateStudentReport;
const getStudentReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId, termId } = req.query;
        if (!studentId || !termId) {
            return res.status(400).json({ error: 'Student ID and Term ID are required' });
        }
        const report = yield prisma.studentTermReport.findUnique({
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
        const results = yield prisma.termResult.findMany({
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
        res.json(Object.assign(Object.assign({}, report), { results: results.map(r => {
                var _a;
                return (Object.assign(Object.assign({}, r), { totalScore: Number(r.totalScore), subjectName: ((_a = r.subject) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown Subject' }));
            }), totalScore,
            averageScore }));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});
exports.getStudentReport = getStudentReport;
const generateClassReports = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Bulk generation for a whole class
    try {
        const { classId, termId } = req.body;
        const students = yield prisma.student.findMany({
            where: { classId, status: 'ACTIVE' }
        });
        let count = 0;
        for (const student of students) {
            // Re-use the logic (refactoring would be better, but calling via internal helper is okay)
            // For now, we will just call the internal logic if we extracted it, 
            // but since we didn't extract it, I'll just loop and call a helper function.
            yield generateSingleStudentReport(student.id, termId);
            count++;
        }
        res.json({ count, message: `Generated reports for ${count} students` });
    }
    catch (error) {
        console.error('Batch generation error:', error);
        res.status(500).json({ error: 'Failed to generate class reports' });
    }
});
exports.generateClassReports = generateClassReports;
// Helper function to avoid code duplication
const generateSingleStudentReport = (studentId, termId) => __awaiter(void 0, void 0, void 0, function* () {
    // 1. Fetch Student and Class
    const student = yield prisma.student.findUnique({
        where: { id: studentId },
        include: { class: true }
    });
    if (!student)
        return;
    // 2. Fetch all assessments for this class and term
    const assessments = yield prisma.assessment.findMany({
        where: {
            classId: student.classId,
            termId: termId
        },
        include: {
            results: {
                where: { studentId }
            }
        }
    });
    // 3. Fetch Grading Scales
    const gradingScales = yield prisma.gradingScale.findMany({
        orderBy: { minScore: 'desc' }
    });
    // 4. Calculate Subject Grades
    const subjectAssessments = {};
    assessments.forEach(a => {
        if (!subjectAssessments[a.subjectId])
            subjectAssessments[a.subjectId] = [];
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
        yield prisma.termResult.upsert({
            where: {
                studentId_subjectId_termId: {
                    studentId,
                    subjectId,
                    termId
                }
            },
            update: {
                totalScore: finalScore,
                grade: (gradeScale === null || gradeScale === void 0 ? void 0 : gradeScale.grade) || 'N/A',
                remarks: gradeScale === null || gradeScale === void 0 ? void 0 : gradeScale.remark
            },
            create: {
                studentId,
                subjectId,
                termId,
                classId: student.classId,
                totalScore: finalScore,
                grade: (gradeScale === null || gradeScale === void 0 ? void 0 : gradeScale.grade) || 'N/A',
                remarks: gradeScale === null || gradeScale === void 0 ? void 0 : gradeScale.remark
            }
        });
    }
    // 5. Create/Update Report Card (Simplified for batch)
    yield prisma.studentTermReport.upsert({
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
});
const updateReportRemarks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId, termId, classTeacherRemark, principalRemark } = req.body;
        const report = yield prisma.studentTermReport.update({
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
    }
    catch (error) {
        console.error('Update remarks error:', error);
        res.status(500).json({ error: 'Failed to update remarks' });
    }
});
exports.updateReportRemarks = updateReportRemarks;
