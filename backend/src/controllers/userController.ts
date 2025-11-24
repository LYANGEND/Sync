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
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(2).optional(),
  role: z.nativeEnum(Role).optional(),
  password: z.string().min(6).optional(),
});

export const getUsers = async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    // Allow SYSTEM_OWNER to bypass tenant check
    if (userRole !== 'SYSTEM_OWNER' && !req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { role } = req.query;
    
    const whereClause: any = {};
    
    // If school context exists, filter by it. 
    // If not (SYSTEM_OWNER global view), don't filter by schoolId (show all).
    if (req.school) {
        whereClause.schoolId = req.school.id;
    }

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
        school: { // Include school info for global view
            select: { name: true, slug: true }
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
    const userRole = (req as any).user?.role;
    if (userRole !== 'SYSTEM_OWNER' && !req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }

    const whereClause: any = {
        role: Role.TEACHER,
        isActive: true,
    };

    if (req.school) {
        whereClause.schoolId = req.school.id;
    }

    const teachers = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        fullName: true,
        email: true,
        school: { select: { name: true } }
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
    const userRole = (req as any).user?.role;
    // If not SYSTEM_OWNER, must have school context
    if (userRole !== 'SYSTEM_OWNER' && !req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }

    const { email, password, fullName, role } = createUserSchema.parse(req.body);

    // If creating a user without school context, they must be SYSTEM_OWNER or similar?
    // Or we might require schoolId in body if not in context?
    // For now, let's assume if no req.school, we create a user with schoolId = null (System Owner)
    // OR we fail if they try to create a TEACHER without a school.
    
    let targetSchoolId = req.school?.id;
    
    // If SYSTEM_OWNER is creating a user and no school context, 
    // maybe they are creating another SYSTEM_OWNER?
    if (!targetSchoolId) {
        if (role !== 'SYSTEM_OWNER') {
             // If trying to create a non-system-owner without a school context, that's invalid
             // Unless we allow passing schoolId in body (which isn't in schema yet)
             return res.status(400).json({ error: 'School context required for this role' });
        }
        // targetSchoolId remains undefined (null in DB)
    }

    const existingUser = await prisma.user.findFirst({ 
      where: { 
        email,
        schoolId: targetSchoolId || null // Check uniqueness within scope
      } 
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists in this scope' });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        schoolId: targetSchoolId, // Can be undefined/null
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
    const userRole = (req as any).user?.role;
    if (userRole !== 'SYSTEM_OWNER' && !req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { id } = req.params;
    const { email, fullName, role, password } = updateUserSchema.parse(req.body);

    // Verify ownership or existence
    const whereClause: any = { id };
    if (req.school) {
        whereClause.schoolId = req.school.id;
    }
    // If SYSTEM_OWNER and no school, we find user globally by ID

    const existing = await prisma.user.findFirst({
      where: whereClause
    });

    if (!existing) {
      return res.status(404).json({ message: 'User not found' });
    }

    const data: any = { email, fullName, role };
    if (password) {
      data.passwordHash = await hashPassword(password);
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
    const userRole = (req as any).user?.role;
    if (userRole !== 'SYSTEM_OWNER' && !req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { id } = req.params;
    
    const whereClause: any = { id };
    if (req.school) {
        whereClause.schoolId = req.school.id;
    }

    const user = await prisma.user.findFirst({ 
      where: whereClause 
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
    res.status(500).json({ error: 'Failed to toggle user status' });
  }
};
