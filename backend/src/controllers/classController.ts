import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, getUserId, getUserRole, handleControllerError } from '../utils/tenantContext';

const prisma = new PrismaClient();

const classSchema = z.object({
  name: z.string().min(2),
  gradeLevel: z.number().int().min(0).max(12),
  teacherId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  subjectIds: z.array(z.string().uuid()).optional(),
});

export const getClasses = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userRole = getUserRole(req);
    const userId = getUserId(req);

    let whereClause: any = { tenantId };

    // Teachers only see their own classes
    if (userRole === 'TEACHER') {
      whereClause.teacherId = userId;
    }

    const classes = await prisma.class.findMany({
      where: whereClause,
      include: {
        teacher: {
          select: { fullName: true },
        },
        subjects: true,
        _count: {
          select: { students: true },
        },
      },
      orderBy: [
        { gradeLevel: 'asc' },
        { name: 'asc' },
      ],
    });
    res.json(classes);
  } catch (error) {
    handleControllerError(res, error, 'getClasses');
  }
};

export const getClassById = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const classData = await prisma.class.findFirst({
      where: { id, tenantId },
      include: {
        teacher: {
          select: { fullName: true },
        },
        subjects: true,
        students: {
          where: { status: 'ACTIVE' },
          orderBy: { lastName: 'asc' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
          }
        },
        _count: {
          select: { students: true },
        },
      },
    });

    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    res.json(classData);
  } catch (error) {
    handleControllerError(res, error, 'getClassById');
  }
};

export const createClass = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { name, gradeLevel, teacherId, academicTermId, subjectIds } = classSchema.parse(req.body);

    // Verify teacher belongs to this tenant
    const teacher = await prisma.user.findFirst({
      where: { id: teacherId, tenantId }
    });
    if (!teacher) {
      return res.status(400).json({ error: 'Teacher not found' });
    }

    // Verify academic term belongs to this tenant
    const term = await prisma.academicTerm.findFirst({
      where: { id: academicTermId, tenantId }
    });
    if (!term) {
      return res.status(400).json({ error: 'Academic term not found' });
    }

    const newClass = await prisma.class.create({
      data: {
        tenantId,
        name,
        gradeLevel,
        teacherId,
        academicTermId,
        subjects: subjectIds ? {
          connect: subjectIds.map(id => ({ id })),
        } : undefined,
      },
      include: {
        subjects: true,
        teacher: {
          select: { fullName: true }
        },
      },
    });

    res.status(201).json(newClass);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'createClass');
  }
};

export const updateClass = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { name, gradeLevel, teacherId, academicTermId, subjectIds } = classSchema.parse(req.body);

    // Verify class belongs to this tenant
    const existing = await prisma.class.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const updatedClass = await prisma.class.update({
      where: { id },
      data: {
        name,
        gradeLevel,
        teacherId,
        academicTermId,
        subjects: subjectIds ? {
          set: subjectIds.map(id => ({ id })),
        } : undefined,
      },
      include: {
        subjects: true,
        teacher: {
          select: { fullName: true }
        },
      },
    });

    res.json(updatedClass);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'updateClass');
  }
};

export const deleteClass = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    // Verify class belongs to this tenant
    const existing = await prisma.class.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Class not found' });
    }

    await prisma.class.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    handleControllerError(res, error, 'deleteClass');
  }
};

export const getClassesByTerm = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { termId } = req.params;

    const classes = await prisma.class.findMany({
      where: {
        tenantId,
        academicTermId: termId
      },
      include: {
        teacher: {
          select: { fullName: true },
        },
        subjects: true,
        _count: {
          select: { students: true },
        },
      },
      orderBy: [
        { gradeLevel: 'asc' },
        { name: 'asc' },
      ],
    });

    res.json(classes);
  } catch (error) {
    handleControllerError(res, error, 'getClassesByTerm');
  }
};

export const getClassStudents = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    // Verify class belongs to this tenant
    const classData = await prisma.class.findFirst({
      where: { id, tenantId }
    });
    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const students = await prisma.student.findMany({
      where: {
        tenantId,
        classId: id,
        status: 'ACTIVE',
      },
      orderBy: { lastName: 'asc' },
    });

    res.json(students);
  } catch (error) {
    handleControllerError(res, error, 'getClassStudents');
  }
};
