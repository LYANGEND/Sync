import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { hashPassword } from '../utils/auth';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  role: z.nativeEnum(Role),
  branchId: z.string().optional().nullable(),
});

const roleSchema = z.preprocess(
  (value) => typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '_') : value,
  z.nativeEnum(Role)
);

const booleanFromCsvSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (['true', 'yes', '1', 'active'].includes(normalized)) return true;
  if (['false', 'no', '0', 'inactive'].includes(normalized)) return false;
  return value;
}, z.boolean().optional());

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(2).optional(),
  role: roleSchema.optional(),
  password: z.string().min(6).optional(),
  branchId: z.string().optional().nullable(),
});

const bulkUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  role: roleSchema,
  branchId: z.string().optional().nullable(),
  branchCode: z.string().optional().nullable(),
  branchName: z.string().optional().nullable(),
  isActive: booleanFromCsvSchema,
});

const bulkUserAccessSchema = z.object({
  ids: z.array(z.string()).min(1),
  role: roleSchema.optional(),
  branchId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
}).refine((data) => data.role !== undefined || data.branchId !== undefined || data.isActive !== undefined, {
  message: 'Provide at least one bulk change.',
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
        branchId: true,
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

export const bulkCreateUsers = async (req: Request, res: Response) => {
  try {
    const usersData = z.array(bulkUserSchema).min(1).max(500).parse(req.body);

    const emails = usersData.map(user => user.email.trim().toLowerCase());
    const duplicateEmails = emails.filter((email, index) => emails.indexOf(email) !== index);
    if (duplicateEmails.length > 0) {
      return res.status(400).json({
        error: `Duplicate emails in import: ${[...new Set(duplicateEmails)].join(', ')}`,
      });
    }

    const existingUsers = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    });

    if (existingUsers.length > 0) {
      return res.status(400).json({
        error: `Users already exist: ${existingUsers.map(user => user.email).join(', ')}`,
      });
    }

    const branches = await prisma.branch.findMany({
      select: { id: true, code: true, name: true },
    });
    const branchById = new Map(branches.map(branch => [branch.id, branch.id]));
    const branchByCode = new Map(branches.map(branch => [branch.code.toLowerCase(), branch.id]));
    const branchByName = new Map(branches.map(branch => [branch.name.toLowerCase(), branch.id]));

    const dataToCreate = await Promise.all(usersData.map(async (user, index) => {
      let branchId = user.branchId?.trim() || null;
      const branchCode = user.branchCode?.trim();
      const branchName = user.branchName?.trim();

      if (branchId && !branchById.has(branchId)) {
        throw new Error(`Row ${index + 2}: branchId "${branchId}" was not found.`);
      }

      if (!branchId && branchCode) {
        branchId = branchByCode.get(branchCode.toLowerCase()) || null;
        if (!branchId) {
          throw new Error(`Row ${index + 2}: branchCode "${branchCode}" was not found.`);
        }
      }

      if (!branchId && branchName) {
        branchId = branchByName.get(branchName.toLowerCase()) || null;
        if (!branchId) {
          throw new Error(`Row ${index + 2}: branchName "${branchName}" was not found.`);
        }
      }

      return {
        email: user.email.trim().toLowerCase(),
        passwordHash: await hashPassword(user.password),
        fullName: user.fullName.trim(),
        role: user.role,
        branchId,
        isActive: user.isActive ?? true,
      };
    }));

    const result = await prisma.user.createMany({
      data: dataToCreate,
    });

    res.status(201).json({
      message: `Successfully imported ${result.count} users`,
      count: result.count,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof Error && error.message.startsWith('Row ')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Bulk create users error:', error);
    res.status(500).json({
      error: 'Failed to import users',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const bulkUpdateUserAccess = async (req: Request, res: Response) => {
  try {
    const { ids, role, branchId, isActive } = bulkUserAccessSchema.parse(req.body);
    const currentUserId = (req as any).user?.userId;

    if (currentUserId && ids.includes(currentUserId)) {
      return res.status(400).json({ error: 'Remove your own account from the selection before applying bulk access changes.' });
    }

    if (branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      if (!branch) {
        return res.status(400).json({ error: 'Selected branch was not found.' });
      }
    }

    const data: any = {};
    if (role !== undefined) data.role = role;
    if (branchId !== undefined) data.branchId = branchId || null;
    if (isActive !== undefined) data.isActive = isActive;

    const result = await prisma.user.updateMany({
      where: { id: { in: ids } },
      data,
    });

    res.json({
      message: `Updated ${result.count} users`,
      count: result.count,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Bulk update users error:', error);
    res.status(500).json({ error: 'Failed to update selected users' });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, role, branchId } = createUserSchema.extend({ role: roleSchema }).parse(req.body);

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
        branchId: branchId || null
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
    console.error('Failed to create user:', error);
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
      data.branchId = branchId || null;
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
    console.error('Failed to update user:', error);
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
