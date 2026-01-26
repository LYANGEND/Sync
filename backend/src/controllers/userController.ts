import { Request, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from '../utils/auth';

const prisma = new PrismaClient();

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  role: z.nativeEnum(Role),
  branchId: z.string().optional(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(2).optional(),
  role: z.nativeEnum(Role).optional(),
  password: z.string().min(6).optional(),
  branchId: z.string().optional().nullable(),
});

export const getUsers = async (req: Request, res: Response) => {
  try {
    const { role } = req.query;

    const whereClause: any = {};
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
        branch: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const getTeachers = async (req: Request, res: Response) => {
  try {
    // Optional: Filter teachers by branch if the requester is not SUPER_ADMIN?
    // For now, let's keep it global or we can filter if needed.
    const teachers = await prisma.user.findMany({
      where: {
        role: Role.TEACHER,
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        branchId: true,
      },
      orderBy: {
        fullName: 'asc',
      },
    });
    res.json(teachers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch teachers' });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, role, branchId } = createUserSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role,
        branchId
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        branchId: true
      },
    });

    res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email, fullName, role, password, branchId } = updateUserSchema.parse(req.body);

    const data: any = { email, fullName, role };
    if (password) {
      data.passwordHash = await hashPassword(password);
    }
    if (branchId !== undefined) {
      data.branchId = branchId;
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        branchId: true
      },
    });

    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
};

export const toggleUserStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
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
    res.status(500).json({ error: 'Failed to toggle user status' });
  }
};
