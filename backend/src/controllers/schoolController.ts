import { Request, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from '../utils/auth';

const prisma = new PrismaClient();

const createSchoolSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  address: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  
  // Initial Admin User
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(6),
});

export const createSchool = async (req: Request, res: Response) => {
  try {
    // Only SYSTEM_OWNER can create schools
    const userRole = (req as any).user?.role;
    if (userRole !== Role.SYSTEM_OWNER) {
        return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const data = createSchoolSchema.parse(req.body);

    // 1. Check if slug is taken
    const existingSchool = await prisma.school.findUnique({
      where: { slug: data.slug }
    });

    if (existingSchool) {
      return res.status(400).json({ message: 'School slug already exists' });
    }

    // 2. Create School and Admin User in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create School
      const school = await tx.school.create({
        data: {
          name: data.name,
          slug: data.slug,
          address: data.address,
          email: data.email,
          phone: data.phone,
        }
      });

      // Hash Password
      const passwordHash = await hashPassword(data.adminPassword);

      // Create Admin User
      const adminUser = await tx.user.create({
        data: {
          schoolId: school.id,
          fullName: data.adminName,
          email: data.adminEmail,
          passwordHash,
          role: Role.SUPER_ADMIN,
        }
      });

      return { school, adminUser };
    });

    res.status(201).json({
      message: 'School created successfully',
      school: {
        id: result.school.id,
        name: result.school.name,
        slug: result.school.slug,
      },
      admin: {
        id: result.adminUser.id,
        email: result.adminUser.email,
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Create school error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const listSchools = async (req: Request, res: Response) => {
    try {
        // Only SYSTEM_OWNER can list all schools
        const userRole = (req as any).user?.role;
        if (userRole !== Role.SYSTEM_OWNER) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }

        const schools = await prisma.school.findMany({
            select: {
                id: true,
                name: true,
                slug: true,
                isActive: true,
                createdAt: true
            }
        });
        res.json(schools);
    } catch (error) {
        console.error('List schools error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateSchool = async (req: Request, res: Response) => {
    try {
        const userRole = (req as any).user?.role;
        if (userRole !== Role.SYSTEM_OWNER) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }

        const { id } = req.params;
        const { name, address, phone, email, isActive } = req.body;

        const school = await prisma.school.update({
            where: { id },
            data: {
                name,
                address,
                phone,
                email,
                isActive
            }
        });

        res.json(school);
    } catch (error) {
        console.error('Update school error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteSchool = async (req: Request, res: Response) => {
    try {
        const userRole = (req as any).user?.role;
        if (userRole !== Role.SYSTEM_OWNER) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }

        const { id } = req.params;

        // Soft delete or hard delete? Let's do soft delete via isActive for now, or hard delete if requested.
        // For now, let's assume hard delete but warn about cascading.
        // Actually, safer to just deactivate.
        
        await prisma.school.update({
            where: { id },
            data: { isActive: false }
        });

        res.json({ message: 'School deactivated successfully' });
    } catch (error) {
        console.error('Delete school error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
