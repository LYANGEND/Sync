import { AuthRequest } from '../middleware/authMiddleware';
import {
  assertStudentsEnrolledInClass,
  getStudentPlacementForTerm,
  type PlacementClient,
  StudentPlacementError,
} from '../services/studentPlacementService';
import { prisma } from './prisma';

export class AcademicScopeError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const ensureAcademicClassAccess = async (
  req: AuthRequest,
  classId: string,
  options?: {
    subjectId?: string;
    academicTermId?: string;
  }
) => {
  const user = req.user;
  if (!user) {
    throw new AcademicScopeError(401, 'Unauthorized');
  }

  const classInfo = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      subjects: { select: { id: true, name: true, code: true } },
      academicTerm: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
    },
  });

  if (!classInfo) {
    throw new AcademicScopeError(404, 'Class not found');
  }

  if (options?.academicTermId && classInfo.academicTermId !== options.academicTermId) {
    throw new AcademicScopeError(400, 'Selected class does not belong to the requested academic term');
  }

  if (user.role !== 'SUPER_ADMIN' && user.branchId && classInfo.branchId && classInfo.branchId !== user.branchId) {
    throw new AcademicScopeError(403, 'You do not have access to this class');
  }

  if (options?.subjectId) {
    const classHasSubject = classInfo.subjects.some((subject) => subject.id === options.subjectId);
    if (!classHasSubject) {
      throw new AcademicScopeError(400, 'Selected subject is not assigned to this class');
    }
  }

  if (user.role === 'STUDENT') {
    const student = await prisma.student.findFirst({
      where: { userId: user.userId },
      select: { id: true },
    });

    const placement = student
      ? await getStudentPlacementForTerm(student.id, classInfo.academicTermId)
      : null;
    if (!placement || placement.classId !== classId) {
      throw new AcademicScopeError(403, 'You do not have access to this class');
    }

    return classInfo;
  }

  if (user.role === 'PARENT') {
    const childInClass = await prisma.studentTermEnrollment.findFirst({
      where: {
        classId,
        academicTermId: classInfo.academicTermId,
        student: { parentId: user.userId },
      },
      select: { studentId: true },
    });

    if (!childInClass) {
      throw new AcademicScopeError(403, 'You do not have access to this class');
    }

    return classInfo;
  }

  if (user.role === 'TEACHER') {
    const isClassTeacher = classInfo.teacherId === user.userId;
    const teacherAllocation = await prisma.teacherSubject.findFirst({
      where: {
        teacherId: user.userId,
        classId,
        ...(options?.subjectId ? { subjectId: options.subjectId } : {}),
      },
      select: { id: true },
    });

    if (!isClassTeacher && !teacherAllocation) {
      throw new AcademicScopeError(403, 'You are not assigned to this class');
    }
  }

  return classInfo;
};

export const ensureStudentRecordAccess = async (
  req: AuthRequest,
  studentId: string,
  options?: { academicTermId?: string },
) => {
  const user = req.user;
  if (!user) {
    throw new AcademicScopeError(401, 'Unauthorized');
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      parentId: true,
      userId: true,
      branchId: true,
    },
  });

  if (!student) {
    throw new AcademicScopeError(404, 'Student not found');
  }

  if (user.role === 'SUPER_ADMIN') {
    return student;
  }

  if (user.role === 'PARENT') {
    if (student.parentId !== user.userId) {
      throw new AcademicScopeError(403, 'Access denied');
    }
    return student;
  }

  if (user.role === 'STUDENT') {
    if (student.userId !== user.userId) {
      throw new AcademicScopeError(403, 'Access denied');
    }
    return student;
  }

  if (user.branchId && student.branchId && student.branchId !== user.branchId) {
    throw new AcademicScopeError(403, 'Access denied');
  }

  if (user.role === 'TEACHER') {
    if (!options?.academicTermId) {
      throw new AcademicScopeError(400, 'Academic term ID is required for teacher student access');
    }
    const placement = await getStudentPlacementForTerm(student.id, options.academicTermId);
    if (!placement) {
      throw new AcademicScopeError(403, 'Student has no placement in the requested academic term');
    }
    await ensureAcademicClassAccess(req, placement.classId, {
      academicTermId: options.academicTermId,
    });
  }

  return student;
};

export const ensureStudentsBelongToClass = async (
  classId: string,
  academicTermId: string,
  studentIds: string[],
  options: { client?: PlacementClient } = {},
) => {
  try {
    await assertStudentsEnrolledInClass(classId, academicTermId, studentIds, {
      client: options.client,
    });
  } catch (error) {
    if (error instanceof StudentPlacementError) {
      throw new AcademicScopeError(error.status, error.message);
    }
    throw error;
  }
};

export const ensureTopicMatchesClassGrade = async (topicId: string, classId: string) => {
  const [topic, classInfo] = await Promise.all([
    prisma.topic.findUnique({ where: { id: topicId }, select: { id: true, gradeLevel: true, subjectId: true } }),
    prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, gradeLevel: true, subjects: { select: { id: true } } },
    }),
  ]);

  if (!topic) {
    throw new AcademicScopeError(404, 'Topic not found');
  }

  if (!classInfo) {
    throw new AcademicScopeError(404, 'Class not found');
  }

  if (topic.gradeLevel !== classInfo.gradeLevel) {
    throw new AcademicScopeError(400, 'This topic does not belong to the selected class grade level');
  }

  if (!classInfo.subjects.some((subject) => subject.id === topic.subjectId)) {
    throw new AcademicScopeError(400, 'This topic subject is not assigned to the selected class');
  }

  return { topic, classInfo };
};
