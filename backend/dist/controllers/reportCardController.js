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
exports.verifyReport = exports.updateReportRemarks = exports.generateClassReports = exports.getClassReports = exports.getStudentReport = exports.generateStudentReport = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const generateStudentReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId, termId } = req.body;
        yield generateSingleStudentReport(studentId, termId);
        // Fetch School Settings
        const settings = yield prisma.schoolSettings.findFirst();
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
            averageScore, school: settings }));
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
        const settings = yield prisma.schoolSettings.findFirst();
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
            averageScore, school: settings }));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});
exports.getStudentReport = getStudentReport;
const getClassReports = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId, termId } = req.query;
        const settings = yield prisma.schoolSettings.findFirst();
        if (!classId || !termId) {
            return res.status(400).json({ error: 'Class ID and Term ID are required' });
        }
        // 1. Get all students in class
        const students = yield prisma.student.findMany({
            where: { classId: String(classId), status: 'ACTIVE' },
            include: {
                class: true,
            },
            orderBy: { lastName: 'asc' }
        });
        const reports = [];
        // 2. Fetch report for each student
        // Optimized: Fetch all reports and results in bulk
        const studentIds = students.map(s => s.id);
        const termReports = yield prisma.studentTermReport.findMany({
            where: {
                studentId: { in: studentIds },
                termId: String(termId)
            },
            include: {
                term: true
            }
        });
        const allResults = yield prisma.termResult.findMany({
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
                reports.push(Object.assign(Object.assign({}, report), { student, class: student.class, results: results.map(r => {
                        var _a;
                        return (Object.assign(Object.assign({}, r), { totalScore: Number(r.totalScore), subjectName: ((_a = r.subject) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown Subject' }));
                    }), totalScore,
                    averageScore }));
            }
        }
        res.json(reports);
    }
    catch (error) {
        console.error('Get class reports error:', error);
        res.status(500).json({ error: 'Failed to fetch class reports' });
    }
});
exports.getClassReports = getClassReports;
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
    // 0. Fetch Term for dates
    const term = yield prisma.academicTerm.findUnique({
        where: { id: termId }
    });
    if (!term)
        return;
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
    // 5. Calculate Attendance
    const attendanceCount = yield prisma.attendance.count({
        where: {
            studentId,
            date: {
                gte: term.startDate,
                lte: term.endDate
            },
            status: { in: ['PRESENT', 'LATE'] }
        }
    });
    const schoolDays = yield prisma.attendance.groupBy({
        by: ['date'],
        where: {
            classId: student.classId,
            date: {
                gte: term.startDate,
                lte: term.endDate
            }
        }
    });
    const totalDays = schoolDays.length > 0 ? schoolDays.length : 60;
    // 6. Create/Update Report Card
    yield prisma.studentTermReport.upsert({
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
const verifyReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const report = yield prisma.studentTermReport.findUnique({
            where: { id },
            include: {
                student: true,
                class: true,
                term: true
            }
        });
        if (!report) {
            return res.status(404).json({ valid: false, message: 'Report not found' });
        }
        const settings = yield prisma.schoolSettings.findFirst();
        const results = yield prisma.termResult.findMany({
            where: {
                studentId: report.studentId,
                termId: report.termId
            }
        });
        const totalScore = results.reduce((sum, r) => sum + Number(r.totalScore), 0);
        const averageScore = results.length > 0 ? totalScore / results.length : 0;
        res.json({
            valid: true,
            studentName: `${report.student.firstName} ${report.student.lastName}`,
            admissionNumber: report.student.admissionNumber,
            className: report.class.name,
            term: report.term.name,
            averageScore,
            schoolName: (settings === null || settings === void 0 ? void 0 : settings.schoolName) || 'Sync School System',
            generatedAt: report.updatedAt
        });
    }
    catch (error) {
        console.error('Verify report error:', error);
        res.status(500).json({ valid: false, error: 'Verification failed' });
    }
});
exports.verifyReport = verifyReport;
