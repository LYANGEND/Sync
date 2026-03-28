import { AttendanceStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { createNotification } from './notificationService';

const LATE_THRESHOLD_MS = 10 * 60 * 1000;

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function formatAttendanceSummary(summary: {
  presentCount: number;
  lateCount: number;
  absentCount: number;
  totalStudents: number;
}) {
  return `Attendance Summary: ${summary.presentCount} present, ${summary.lateCount} late, ` +
    `${summary.absentCount} absent out of ${summary.totalStudents} students.`;
}

interface AttendanceSyncResult {
  synced: boolean;
  skippedReason?: string;
  attendanceDate?: string;
  totalStudents: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  recordedCount: number;
}

export async function syncClassroomAttendance(classroomId: string): Promise<AttendanceSyncResult> {
  const classroom = await prisma.virtualClassroom.findUnique({
    where: { id: classroomId },
    select: {
      id: true,
      title: true,
      classId: true,
      teacherId: true,
      createdById: true,
      scheduledStart: true,
      actualStart: true,
      scheduledEnd: true,
      actualEnd: true,
      participants: {
        orderBy: { joinedAt: 'asc' },
        select: {
          studentId: true,
          userId: true,
          displayName: true,
          role: true,
          joinedAt: true,
        },
      },
      recordings: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          summary: true,
          transcript: true,
        },
      },
    },
  });

  if (!classroom) {
    throw new Error('Classroom not found');
  }

  if (!classroom.classId) {
    return {
      synced: false,
      skippedReason: 'Classroom is not linked to a class',
      totalStudents: 0,
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      recordedCount: 0,
    };
  }

  const recordedByUserId = classroom.teacherId || classroom.createdById;
  if (!recordedByUserId) {
    return {
      synced: false,
      skippedReason: 'No teacher/creator available to attribute attendance',
      totalStudents: 0,
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      recordedCount: 0,
    };
  }

  const attendanceDate = classroom.actualStart || classroom.scheduledStart;
  const dayStart = startOfDay(attendanceDate);
  const dayEnd = endOfDay(attendanceDate);

  const existingAttendanceCount = await prisma.attendance.count({
    where: {
      classId: classroom.classId,
      date: {
        gte: dayStart,
        lte: dayEnd,
      },
    },
  });

  if (existingAttendanceCount > 0) {
    return {
      synced: false,
      skippedReason: 'Attendance already exists for this class and day',
      attendanceDate: dayStart.toISOString(),
      totalStudents: 0,
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      recordedCount: 0,
    };
  }

  const students = await prisma.student.findMany({
    where: {
      classId: classroom.classId,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      parentId: true,
      userId: true,
    },
    orderBy: [
      { lastName: 'asc' },
      { firstName: 'asc' },
    ],
  });

  if (students.length === 0) {
    return {
      synced: false,
      skippedReason: 'No active students found in the linked class',
      attendanceDate: dayStart.toISOString(),
      totalStudents: 0,
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      recordedCount: 0,
    };
  }

  const nonStaffParticipants = classroom.participants.filter((participant) => participant.role !== 'TEACHER' && participant.role !== 'OBSERVER');
  const participantByStudentId = new Map<string, Date>();
  const participantByUserId = new Map<string, Date>();
  const participantByName = new Map<string, Date>();

  for (const participant of nonStaffParticipants) {
    if (participant.studentId && !participantByStudentId.has(participant.studentId)) {
      participantByStudentId.set(participant.studentId, participant.joinedAt);
    }

    if (participant.userId && !participantByUserId.has(participant.userId)) {
      participantByUserId.set(participant.userId, participant.joinedAt);
    }

    const normalizedDisplayName = normalizeName(participant.displayName);
    if (normalizedDisplayName && !participantByName.has(normalizedDisplayName)) {
      participantByName.set(normalizedDisplayName, participant.joinedAt);
    }
  }

  const studentsByName = new Map<string, { id: string; firstName: string; lastName: string; parentId: string | null; userId: string | null }[]>();
  for (const student of students) {
    const normalizedStudentName = normalizeName(`${student.firstName} ${student.lastName}`);
    const list = studentsByName.get(normalizedStudentName) || [];
    list.push(student);
    studentsByName.set(normalizedStudentName, list);
  }

  const lateThreshold = new Date((classroom.actualStart || classroom.scheduledStart).getTime() + LATE_THRESHOLD_MS);
  const attendanceRows: {
    studentId: string;
    classId: string;
    date: Date;
    status: AttendanceStatus;
    recordedByUserId: string;
  }[] = [];

  const absentOrLateStudents: { id: string; fullName: string; parentId: string | null; status: AttendanceStatus }[] = [];
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;

  for (const student of students) {
    let joinedAt: Date | undefined;

    if (participantByStudentId.has(student.id)) {
      joinedAt = participantByStudentId.get(student.id);
    } else if (student.userId && participantByUserId.has(student.userId)) {
      joinedAt = participantByUserId.get(student.userId);
    } else {
      const normalizedStudentName = normalizeName(`${student.firstName} ${student.lastName}`);
      const namedMatches = studentsByName.get(normalizedStudentName) || [];
      if (namedMatches.length === 1 && participantByName.has(normalizedStudentName)) {
        joinedAt = participantByName.get(normalizedStudentName);
      }
    }

    const status = !joinedAt
      ? AttendanceStatus.ABSENT
      : joinedAt.getTime() > lateThreshold.getTime()
        ? AttendanceStatus.LATE
        : AttendanceStatus.PRESENT;

    if (status === AttendanceStatus.PRESENT) presentCount++;
    if (status === AttendanceStatus.LATE) lateCount++;
    if (status === AttendanceStatus.ABSENT) absentCount++;

    if (status !== AttendanceStatus.PRESENT) {
      absentOrLateStudents.push({
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`,
        parentId: student.parentId,
        status,
      });
    }

    attendanceRows.push({
      studentId: student.id,
      classId: classroom.classId,
      date: dayStart,
      status,
      recordedByUserId,
    });
  }

  await prisma.attendance.createMany({
    data: attendanceRows,
  });

  const summaryText = formatAttendanceSummary({
    presentCount,
    lateCount,
    absentCount,
    totalStudents: students.length,
  });

  const transcriptLines = [
    '[Attendance Sync]',
    summaryText,
    ...attendanceRows.map((row) => {
      const student = students.find((entry) => entry.id === row.studentId)!;
      return `${student.firstName} ${student.lastName}: ${row.status}`;
    }),
  ].join('\n');

  const latestRecording = classroom.recordings[0];
  if (latestRecording) {
    await prisma.classRecording.update({
      where: { id: latestRecording.id },
      data: {
        summary: latestRecording.summary
          ? `${latestRecording.summary}\n\n${summaryText}`
          : summaryText,
        transcript: latestRecording.transcript
          ? `${latestRecording.transcript}\n\n${transcriptLines}`
          : transcriptLines,
      },
    });
  } else {
    await prisma.classRecording.create({
      data: {
        classroomId,
        summary: summaryText,
        transcript: transcriptLines,
        keyTopics: ['attendance-sync'],
      },
    });
  }

  await prisma.classroomChat.create({
    data: {
      classroomId,
      senderName: 'System',
      isAI: true,
      message: `${summaryText} Attendance was recorded automatically from virtual classroom participation.`,
    },
  });

  const dateStr = dayStart.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  for (const student of absentOrLateStudents) {
    if (!student.parentId) continue;

    const statusLabel = student.status === AttendanceStatus.ABSENT ? 'absent from' : 'late to';
    await createNotification(
      student.parentId,
      `Attendance Alert: ${student.fullName}`,
      `${student.fullName} was ${statusLabel} ${classroom.title} on ${dateStr}.`,
      'WARNING'
    );
  }

  return {
    synced: true,
    attendanceDate: dayStart.toISOString(),
    totalStudents: students.length,
    presentCount,
    lateCount,
    absentCount,
    recordedCount: attendanceRows.length,
  };
}
