import { Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from '../utils/auth';
import { TenantRequest, getTenantId, handleControllerError } from '../utils/tenantContext';

const prisma = new PrismaClient();

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  role: z.nativeEnum(Role),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(2).optional(),
  role: z.nativeEnum(Role).optional(),
  password: z.string().min(6).optional(),
});

export const getUsers = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { role } = req.query;

    const whereClause: any = { tenantId };
    if (role) {
      whereClause.role = role as Role;
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        profilePictureUrl: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(users);
  } catch (error) {
    handleControllerError(res, error, 'getUsers');
  }
};

export const getTeachers = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const teachers = await prisma.user.findMany({
      where: {
        tenantId,
        role: Role.TEACHER,
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
      },
      orderBy: {
        fullName: 'asc',
      },
    });
    res.json(teachers);
  } catch (error) {
    handleControllerError(res, error, 'getTeachers');
  }
};

export const createUser = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { email, password, fullName, role } = createUserSchema.parse(req.body);

    // Check if user exists in THIS tenant
    const existingUser = await prisma.user.findFirst({
      where: { email, tenantId }
    });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Check tenant user limits
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant && tenant.maxUsers !== -1 && tenant.currentUserCount >= tenant.maxUsers) {
      return res.status(403).json({
        error: 'User limit reached',
        message: `Maximum of ${tenant.maxUsers} users allowed. Please upgrade your plan.`
      });
    }

    const passwordHash = await hashPassword(password);

    // Create user and update counts
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          tenantId,
          email,
          passwordHash,
          fullName,
          role,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      // Update tenant counts
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          currentUserCount: { increment: 1 },
          ...(role === 'TEACHER' ? { currentTeacherCount: { increment: 1 } } : {}),
        }
      });

      return newUser;
    });

    res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'createUser');
  }
};

export const updateUser = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { email, fullName, role, password } = updateUserSchema.parse(req.body);

    // Verify user belongs to this tenant
    const existingUser = await prisma.user.findFirst({
      where: { id, tenantId }
    });
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const data: any = { email, fullName, role };
    if (password) {
      data.passwordHash = await hashPassword(password);
    }

    // Handle teacher count changes
    const oldRole = existingUser.role;
    const newRole = role;

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data,
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
        },
      });

      // Update teacher count if role changed
      if (newRole && oldRole !== newRole) {
        if (oldRole === 'TEACHER' && newRole !== 'TEACHER') {
          await tx.tenant.update({
            where: { id: tenantId },
            data: { currentTeacherCount: { decrement: 1 } }
          });
        } else if (oldRole !== 'TEACHER' && newRole === 'TEACHER') {
          await tx.tenant.update({
            where: { id: tenantId },
            data: { currentTeacherCount: { increment: 1 } }
          });
        }
      }

      return updated;
    });

    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'updateUser');
  }
};

export const toggleUserStatus = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const user = await prisma.user.findFirst({
      where: { id, tenantId }
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
      select: {
        id: true,
        isActive: true,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    handleControllerError(res, error, 'toggleUserStatus');
  }
};
