import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import * as metrics from '../services/metricsService';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    const userId = (req as any).user?.userId;
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : '';
    if (!academicTermId || !await prisma.academicTerm.findUnique({ where: { id: academicTermId }, select: { id: true } })) {
      return res.status(400).json({ error: 'A valid academicTermId is required' });
    }

    if (userRole === 'TEACHER') {
      // 1. My Classes: classes I am class teacher of, plus classes where I teach an allocated subject.
      const myClassRows = await prisma.class.findMany({
        where: {
          academicTermId,
          OR: [{ teacherId: userId }, { teacherAssignments: { some: { teacherId: userId } } }],
        },
        include: {
          _count: { select: { termEnrollments: { where: { status: 'ACTIVE' } } } },
          teacherAssignments: {
            where: { teacherId: userId },
            select: { subjectId: true, subject: { select: { name: true } } },
          },
        },
        orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
      });
      const myClasses = myClassRows.map(({ _count, teacherAssignments, ...classRecord }) => ({
        ...classRecord,
        isClassTeacher: classRecord.teacherId === userId,
        mySubjects: teacherAssignments.map((assignment) => ({ id: assignment.subjectId, name: assignment.subject.name })),
        _count: { students: _count.termEnrollments },
      }));
      const classById = new Map(myClasses.map((classRecord) => [classRecord.id, classRecord]));
      const classTeacherIds = myClasses.filter((c) => c.isClassTeacher).map((c) => c.id);
      const allocations = myClasses.flatMap((c) => c.mySubjects.map((s) => ({ classId: c.id, subjectId: s.id })));

      const totalStudents = myClasses.reduce((acc, curr) => acc + curr._count.students, 0);

      // 2. Today's Schedule
      const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const now = new Date();
      const todayDay = days[now.getDay()];

      const scheduleRows = await prisma.timetablePeriod.findMany({
        where: {
          teacherId: userId,
          academicTermId,
          dayOfWeek: todayDay as any
        },
        include: {
          classes: { include: { class: { select: { id: true, name: true } } } },
          subject: { select: { id: true, name: true, code: true } },
        },
        orderBy: { startTime: 'asc' }
      });
      const todaySchedule = scheduleRows.map((period) => ({
        ...period,
        class: period.classes[0]
          ? { id: period.classes[0].class.id, name: period.classes.map((link) => link.class.name).join(', ') }
          : null,
      }));

      // 3. Assessments I am responsible for: every subject in my own classes, plus my allocated subjects.
      const assessmentScope = {
        termId: academicTermId,
        OR: [
          ...(classTeacherIds.length ? [{ classId: { in: classTeacherIds } }] : []),
          ...allocations,
        ],
      };
      const hasScope = assessmentScope.OR.length > 0;

      const recentAssessments = hasScope
        ? await prisma.assessment.findMany({
          where: assessmentScope,
          take: 5,
          orderBy: { date: 'desc' },
          include: {
            class: true,
            subject: true,
            _count: { select: { results: true } }
          }
        })
        : [];

      // 4. Today's tasks
      const todayKey = now.toISOString().slice(0, 10);
      const todayStart = new Date(todayKey);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
      const weekStart = new Date(todayStart);
      weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
      const nextWeekStart = new Date(weekStart);
      nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);

      const classTeacherClasses = classTeacherIds
        .map((id) => classById.get(id)!)
        .filter((c) => c._count.students > 0);

      // Lesson plans are expected for subjects I teach: allocations plus anything on my timetable.
      const teachingPairs = new Map<string, { classId: string; subjectId: string }>();
      allocations.forEach((pair) => teachingPairs.set(`${pair.classId}:${pair.subjectId}`, pair));

      const [instructionalToday, attendanceToday, gradedAssessments, draftAssessments, homeworkGroups, timetablePairs, weekPlans] = await Promise.all([
        prisma.termInstructionalDay.findFirst({
          where: { academicTermId, isInstructional: true, date: { gte: todayStart, lt: tomorrowStart } },
          select: { id: true },
        }),
        classTeacherClasses.length
          ? prisma.attendance.groupBy({
            by: ['classId'],
            where: { classId: { in: classTeacherClasses.map((c) => c.id) }, date: { gte: todayStart, lt: tomorrowStart } },
          })
          : Promise.resolve([] as { classId: string }[]),
        hasScope
          ? prisma.assessment.findMany({
            where: {
              ...assessmentScope,
              type: { notIn: ['HOMEWORK', 'PROJECT'] },
              isOnline: false,
              weight: { gt: 0 },
              date: { lt: tomorrowStart },
            },
            select: {
              id: true, title: true, classId: true, subjectId: true, date: true,
              subject: { select: { name: true } },
              _count: { select: { results: true } },
            },
            orderBy: { date: 'desc' },
          })
          : Promise.resolve([]),
        hasScope
          ? prisma.assessment.count({ where: { ...assessmentScope, weight: 0 } })
          : Promise.resolve(0),
        hasScope
          ? prisma.homeworkSubmission.groupBy({
            by: ['assessmentId'],
            where: { status: { in: ['SUBMITTED', 'LATE_SUBMITTED'] }, assessment: assessmentScope },
            _count: { _all: true },
          })
          : Promise.resolve([] as { assessmentId: string; _count: { _all: number } }[]),
        prisma.timetablePeriod.findMany({
          where: { teacherId: userId, academicTermId },
          select: { subjectId: true, classes: { select: { classId: true } } },
        }),
        prisma.lessonPlan.findMany({
          where: { termId: academicTermId, weekStartDate: { gte: weekStart, lt: nextWeekStart } },
          select: { classId: true, subjectId: true },
        }),
      ]);

      timetablePairs.forEach((period) => period.classes.forEach(({ classId }) => {
        if (classById.has(classId)) teachingPairs.set(`${classId}:${period.subjectId}`, { classId, subjectId: period.subjectId });
      }));

      const markedClassIds = new Set(attendanceToday.map((row) => row.classId));
      const attendancePending = instructionalToday
        ? classTeacherClasses
          .filter((c) => !markedClassIds.has(c.id))
          .map((c) => ({ classId: c.id, className: c.name, students: c._count.students }))
        : [];

      const marksPending = gradedAssessments
        .map((assessment) => {
          const classRecord = classById.get(assessment.classId);
          return {
            assessmentId: assessment.id,
            title: assessment.title,
            date: assessment.date,
            classId: assessment.classId,
            className: classRecord?.name ?? '',
            subjectId: assessment.subjectId,
            subjectName: assessment.subject.name,
            recorded: assessment._count.results,
            expected: classRecord?._count.students ?? 0,
          };
        })
        .filter((item) => item.recorded < item.expected);

      const homeworkAssessments = homeworkGroups.length
        ? await prisma.assessment.findMany({
          where: { id: { in: homeworkGroups.map((group) => group.assessmentId) } },
          select: { id: true, title: true, classId: true, subjectId: true, subject: { select: { name: true } } },
        })
        : [];
      const homeworkById = new Map(homeworkAssessments.map((assessment) => [assessment.id, assessment]));
      const homeworkToGrade = homeworkGroups.flatMap((group) => {
        const assessment = homeworkById.get(group.assessmentId);
        if (!assessment) return [];
        return [{
          assessmentId: assessment.id,
          title: assessment.title,
          classId: assessment.classId,
          className: classById.get(assessment.classId)?.name ?? '',
          subjectId: assessment.subjectId,
          subjectName: assessment.subject.name,
          count: group._count._all,
        }];
      });

      const plannedPairs = new Set(weekPlans.map((plan) => `${plan.classId}:${plan.subjectId}`));
      const missingPairs = [...teachingPairs.entries()].filter(([key]) => !plannedPairs.has(key)).map(([, pair]) => pair);
      const subjectNames = new Map(
        (missingPairs.length
          ? await prisma.subject.findMany({ where: { id: { in: [...new Set(missingPairs.map((p) => p.subjectId))] } }, select: { id: true, name: true } })
          : []
        ).map((subject) => [subject.id, subject.name]),
      );
      const lessonPlansMissing = missingPairs.map((pair) => ({
        classId: pair.classId,
        className: classById.get(pair.classId)?.name ?? '',
        subjectId: pair.subjectId,
        subjectName: subjectNames.get(pair.subjectId) ?? '',
      }));

      return res.json({
        role: 'TEACHER',
        stats: {
          totalStudents,
          totalClasses: myClasses.length,
          todayScheduleCount: todaySchedule.length
        },
        myClasses,
        todaySchedule,
        recentAssessments,
        todayTasks: {
          date: todayKey,
          isInstructionalDay: Boolean(instructionalToday),
          attendancePending,
          marksPending,
          draftAssessments,
          homeworkToGrade,
          lessonPlansMissing,
        },
      });
    }

    // --- ADMIN / BURSAR View — uses shared metricsService for canonical numbers ---

    const [health, recentPayments] = await Promise.all([
      metrics.getSchoolHealthSnapshot(academicTermId),
      prisma.payment.findMany({
        where: { academicTermId, status: 'COMPLETED' },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    const paymentPlacements = await prisma.studentTermEnrollment.findMany({
      where: {
        academicTermId,
        studentId: { in: recentPayments.map(payment => payment.studentId) },
      },
      include: { class: { select: { name: true } } },
    });
    const classByStudentId = new Map(
      paymentPlacements.map(placement => [placement.studentId, placement.class]),
    );

    res.json({
      role: 'ADMIN',
      dailyRevenue: health.revenue.todayRevenue,
      activeStudents: health.enrollment.activeStudents,
      outstandingFees: health.fees.outstanding,
      recentPayments: recentPayments.map(payment => ({
        ...payment,
        amount: Number(payment.amount),
        student: {
          ...payment.student,
          class: classByStudentId.get(payment.studentId) ?? null,
        },
      })),
      intelligence: {
        atRiskCount: health.risk.critical + health.risk.high,
        unresolvedAlerts: health.unresolvedAlerts,
        attendanceRate: health.attendance.ratePercent,
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};
