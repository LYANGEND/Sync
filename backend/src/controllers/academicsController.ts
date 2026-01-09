import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const assignTeacherSchema = z.object({
    classId: z.string().uuid(),
    subjectId: z.string().uuid(),
    teacherId: z.string().uuid(),
});

export const assignSubjectTeacher = async (req: Request, res: Response) => {
    try {
        const { classId, subjectId, teacherId } = assignTeacherSchema.parse(req.body);

        // Verify entities exist
        const [classExists, subjectExists, teacherExists] = await Promise.all([
            prisma.class.findUnique({ where: { id: classId } }),
            prisma.subject.findUnique({ where: { id: subjectId } }),
            prisma.user.findUnique({ where: { id: teacherId, role: { in: ['TEACHER', 'SUPER_ADMIN'] } } }),
        ]);

        if (!classExists) return res.status(404).json({ message: 'Class not found' });
        if (!subjectExists) return res.status(404).json({ message: 'Subject not found' });
        if (!teacherExists) return res.status(404).json({ message: 'Teacher not found' });

        // Upsert the assignment
        // Since we have a unique constraint on [classId, subjectId], upsert works perfectly.
        // However, Prisma upsert needs a unique 'where' clause.
        // The @@unique([classId, subjectId]) generates a compound unique index.

        const assignment = await prisma.teacherSubject.upsert({
            where: {
                classId_subjectId: {
                    classId,
                    subjectId,
                },
            },
            update: {
                teacherId,
            },
            create: {
                classId,
                subjectId,
                teacherId,
            },
            include: {
                teacher: { select: { fullName: true } },
                subject: { select: { name: true } },
                class: { select: { name: true } },
            },
        });

        res.json(assignment);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Assign teacher error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getClassSubjectTeachers = async (req: Request, res: Response) => {
    try {
        const { classId } = req.params;

        const assignments = await prisma.teacherSubject.findMany({
            where: { classId },
            include: {
                teacher: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true
                    }
                },
                subject: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    }
                }
            }
        });

        res.json(assignments);
    } catch (error) {
        console.error('Get class assignments error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getTeacherSubjectAssignments = async (req: Request, res: Response) => {
    try {
        const { teacherId } = req.params;

        const assignments = await prisma.teacherSubject.findMany({
            where: { teacherId },
            include: {
                class: {
                    select: {
                        id: true,
                        name: true,
                        gradeLevel: true
                    }
                },
                subject: {
                    select: {
                        id: true,
                        name: true,
                        code: true
                    }
                }
            }
        });

        res.json(assignments);
    } catch (error) {
        console.error('Get teacher assignments error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
