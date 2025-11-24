import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { comparePassword, generateToken, hashPassword } from '../utils/auth';

const prisma = new PrismaClient();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  role: z.enum(['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY']),
});

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    let user;
    let schoolSlug;

    if (req.school?.id) {
      // 1. Tenant Context Available (Subdomain or Header)
      user = await prisma.user.findUnique({ 
        where: { 
          email_schoolId: {
            email,
            schoolId: req.school.id
          }
        },
        include: { school: true }
      });
      schoolSlug = req.school.slug;
    } else {
      // 2. No Tenant Context - Global Lookup
      const users = await prisma.user.findMany({
        where: { email },
        include: { school: true }
      });

      // Filter by password match
      const validUsers = [];
      for (const u of users) {
        if (await comparePassword(password, u.passwordHash)) {
          validUsers.push(u);
        }
      }

      if (validUsers.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (validUsers.length > 1) {
        // Ambiguous login - user exists in multiple schools with same password
        // For now, return the first one, or we could return a list for the frontend to choose
        // Ideally: return 300 Multiple Choices
        // MVP: Pick first active one
        user = validUsers.find(u => u.isActive && u.school?.isActive) || validUsers[0];
      } else {
        user = validUsers[0];
      }
      
      if (user) {
        // If user is SYSTEM_OWNER, they might not have a school
        schoolSlug = user.school?.slug || 'system';
      }
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials or inactive account' });
    }

    // If we did a global lookup, we already checked password. 
    // If we did a scoped lookup, we need to check it now.
    if (req.school?.id) {
        const isValid = await comparePassword(password, user.passwordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
    }

    const token = generateToken(user.id, user.role, user.schoolId || 'system');

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        schoolId: user.schoolId
      },
      tenantSlug: schoolSlug // Return slug so frontend can store it
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Temporary register for seeding/testing
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, role } = registerSchema.parse(req.body);

    if (!req.school?.id) {
      return res.status(400).json({ error: 'School context missing' });
    }

    const existingUser = await prisma.user.findUnique({ 
      where: { 
        email_schoolId: {
          email,
          schoolId: req.school.id
        }
      } 
    });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role,
        schoolId: req.school.id
      },
    });

    const token = generateToken(user.id, user.role, user.schoolId);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        schoolId: user.schoolId
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};
