
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schemas
const createBranchSchema = z.object({
    name: z.string().min(2),
    code: z.string().min(2).toUpperCase(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    isMain: z.boolean().default(false),
});

const updateBranchSchema = createBranchSchema.partial();

export const createBranch = async (req: Request, res: Response) => {
    try {
        const parseResult = createBranchSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }

        const { name, code, address, phone, email, isMain } = parseResult.data;

        // Check if code already exists
        const existingBranch = await prisma.branch.findUnique({ where: { code } });
        if (existingBranch) {
            return res.status(409).json({ message: 'Branch code already exists' });
        }

        // If setting as Main, unset others (optional logic, usually only one main)
        if (isMain) {
            await prisma.branch.updateMany({
                where: { isMain: true },
                data: { isMain: false }
            });
        }

        const branch = await prisma.branch.create({
            data: { name, code, address, phone, email, isMain }
        });

        res.status(201).json(branch);
    } catch (error) {
        console.error('Create branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getAllBranches = async (req: Request, res: Response) => {
    try {
        const branches = await prisma.branch.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { students: true, users: true, classes: true }
                }
            }
        });
        res.json(branches);
    } catch (error) {
        console.error('Get branches error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getBranchById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const branch = await prisma.branch.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { students: true, users: true, classes: true }
                }
            }
        });

        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        res.json(branch);
    } catch (error) {
        console.error('Get branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateBranch = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const parseResult = updateBranchSchema.safeParse(req.body);

        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }

        const data = parseResult.data;

        // If setting as Main, unset others
        if (data.isMain) {
            await prisma.branch.updateMany({
                where: { isMain: true, id: { not: id } },
                data: { isMain: false }
            });
        }

        const branch = await prisma.branch.update({
            where: { id },
            data
        });

        res.json(branch);
    } catch (error) {
        console.error('Update branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteBranch = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Check availability
        const branch = await prisma.branch.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { students: true, users: true, classes: true }
                }
            }
        });

        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // Prevent deleting if it has related data
        if (branch._count.students > 0 || branch._count.users > 0 || branch._count.classes > 0) {
            return res.status(400).json({
                message: 'Cannot delete branch with associated students, users, or classes.',
                counts: branch._count
            });
        }

        await prisma.branch.delete({ where: { id } });
        res.json({ message: 'Branch deleted successfully' });
    } catch (error) {
        console.error('Delete branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
