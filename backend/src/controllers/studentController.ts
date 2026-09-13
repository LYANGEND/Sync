import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { sendEmail } from '../services/emailService';
import { syncStudentClassFees } from '../services/classFeeAssignmentService';
import {
  classIdentityKey,
  ensureClassExistsForTerm,
} from '../services/classResolutionService';
import { AcademicScopeError, ensureStudentRecordAccess } from '../utils/academicScope';
import type { AuthRequest } from '../middleware/authMiddleware';

const baseStudentSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  admissionNumber: z.string().nullable().optional().transform(val => (val === '' || val === null) ? undefined : val),
  dateOfBirth: z.string().transform((str) => new Date(str)),
  gender: z.enum(['MALE', 'FEMALE']),
  guardianName: z.string().nullable().optional().transform(val => (val === '' || val === null) ? undefined : val),
  guardianPhone: z.string().nullable().optional().transform(val => (val === '' || val === null) ? undefined : val),
  guardianEmail: z.string().email().nullable().optional().or(z.literal('')).transform(val => (val === '' || val === null) ? undefined : val),
  address: z.string().nullable().optional().transform(val => (val === '' || val === null) ? undefined : val),
  classId: z.string().uuid().nullable().optional().or(z.literal('')).transform(val => (val === '' || val === null) ? undefined : val),
  className: z.string().nullable().optional().transform(val => (val === '' || val === null) ? undefined : val),
  scholarshipId: z.string().uuid().nullable().optional().or(z.literal('')).transform(val => (val === '' || val === null) ? undefined : val),
  branchId: z.string().uuid().nullable().optional().or(z.literal('')).transform(val => (val === '' || val === null) ? undefined : val),
});

const createStudentSchema = baseStudentSchema.refine(data => data.classId || data.className, {
  message: "Either classId or className must be provided",
  path: ["classId"],
});

const updateStudentSchema = baseStudentSchema.partial().extend({
  status: z.enum(['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'DROPPED_OUT']).optional(),
  reason: z.string().optional(), // For audit trail
});

export const getStudents = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userRole = user?.role;
    const userId = user?.userId;
    const userBranchId = user?.branchId; // Assumes branchId is in the token or attached by middleware

    // Base filter: always exclude archived students
    let whereClause: any = {
      status: { not: 'ARCHIVED' }
    };

    // Branch Scoping: If not SUPER_ADMIN, restrict to user's branch
    if (userRole !== 'SUPER_ADMIN' && userBranchId) {
      whereClause.branchId = userBranchId;
    }

    if (userRole === 'TEACHER') {
      const myClasses = await prisma.class.findMany({
        where: { teacherId: userId },
        select: { id: true }
      });

      const classIds = myClasses.map(c => c.id);

      // Teachers see students in their classes AND belong to their branch (already filtered above)
      whereClause = {
        ...whereClause,
        classId: { in: classIds }
      };
    }

    const students = await prisma.student.findMany({
      where: whereClause,
      include: {
        class: true,
        branch: true,
      },
      orderBy: {
        lastName: 'asc',
      },
    });
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
};

export const createStudent = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const parseResult = createStudentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors });
    }

    const data = parseResult.data;

    // Branch Logic
    let branchId = data.branchId;

    // If user is NOT Super Admin, force them to create in their own branch
    if (user.role !== 'SUPER_ADMIN') {
      if (user.branchId) {
        branchId = user.branchId;
      } else {
        // Fallback: This shouldn't happen if auth middleware is working correctly for restricted roles
        return res.status(403).json({ error: 'User does not belong to a branch and cannot create students.' });
      }
    } else {
      // If Super Admin didn't specify a branch, maybe default to their own?
      // Or leave it null (global). Prefer defaulting to their branch if available.
      if (!branchId && user.branchId) {
        branchId = user.branchId;
      }
    }

    let parentId: string | null = null;

    // Auto-generate admission number if not provided
    // Format: YYYYNNNN (e.g., 20260001)
    let admissionNumber = data.admissionNumber;
    if (!admissionNumber) {
      const year = new Date().getFullYear();
      // Find the last student created this year to increment the number
      const lastStudent = await prisma.student.findFirst({
        where: {
          admissionNumber: {
            startsWith: `${year}`
          }
        },
        orderBy: {
          admissionNumber: 'desc'
        }
      });

      let nextNum = 1;
      if (lastStudent && lastStudent.admissionNumber.length === 8) {
        // Extract last 4 digits as the sequential number
        const lastNumStr = lastStudent.admissionNumber.substring(4);
        const lastNum = parseInt(lastNumStr, 10);
        if (!isNaN(lastNum)) {
          nextNum = lastNum + 1;
        }
      }

      admissionNumber = `${year}${nextNum.toString().padStart(4, '0')}`;
    }

    // If guardian email is provided, try to link or create a parent account
    if (data.guardianEmail) {
      console.log('DEBUG: Processing guardian email:', data.guardianEmail);
      const existingParent = await prisma.user.findFirst({
        where: { email: data.guardianEmail }
      });

      if (existingParent) {
        if (existingParent.role !== 'PARENT') {
          return res.status(400).json({
            error: `Email ${data.guardianEmail} is already in use by a ${existingParent.role}. Cannot use as Guardian Email.`
          });
        }
        console.log('DEBUG: Existing parent found:', existingParent.id);
        parentId = existingParent.id;
      } else {
        console.log('DEBUG: Creating new parent account');
        // Create new parent account
        const password = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(password, 10);

        try {
          const newParent = await prisma.user.create({
            data: {
              email: data.guardianEmail,
              fullName: data.guardianName || 'Guardian',
              role: 'PARENT',
              passwordHash: hashedPassword,
              branchId: branchId, // Assign parent to the same branch as the student
            }
          });
          parentId = newParent.id;

          // Send email with credentials
          console.log('DEBUG: Preparing to send welcome email to new parent');
          const emailSubject = 'Welcome to Sync - Your Parent Account';
          const emailBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1A3A9C;">Welcome to Sync — Run your school. In sync.</h2>
              <p>Dear ${data.guardianName || 'Parent'},</p>
              <p>A parent account has been automatically created for you to track your child's progress.</p>
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold;">Your Login Credentials:</p>
                <p style="margin: 10px 0;">Email: <strong>${data.guardianEmail}</strong></p>
                <p style="margin: 0;">Password: <strong>${password}</strong></p>
              </div>
              <p>Please login at <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}">Sync Portal</a> and change your password immediately.</p>
              <p>Best regards,<br>School Administration</p>
            </div>
          `;

          // Don't await this to avoid blocking the response if email fails
          sendEmail(data.guardianEmail, emailSubject, emailBody).catch(err =>
            console.error('Failed to send parent welcome email:', err)
          );
        } catch (createError: any) {
          // Handle race condition where user was created between findUnique and create
          if (createError.code === 'P2002') {
            console.log('DEBUG: Race condition detected - parent created by another request');
            const retryParent = await prisma.user.findFirst({
              where: { email: data.guardianEmail }
            });
            if (retryParent) {
              parentId = retryParent.id;
            }
          } else {
            throw createError;
          }
        }
      }
    }

    // Resolve className to classId if needed
    let finalClassId = data.classId;

    if (data.className && !finalClassId) {
      // Get current academic term
      const currentTerm = await prisma.academicTerm.findFirst({
        orderBy: { startDate: 'desc' }
      });

      if (!currentTerm) {
        return res.status(400).json({ error: 'No academic term found. Please create an academic term first.' });
      }

      const defaultTeacher = await prisma.user.findFirst({
        where: { role: { in: ['TEACHER', 'SUPER_ADMIN'] } }
      });

      if (!defaultTeacher) {
        return res.status(400).json({ error: 'No teacher found. Please create at least one teacher or admin user first.' });
      }

      finalClassId = await ensureClassExistsForTerm(
        data.className,
        currentTerm.id,
        defaultTeacher.id,
        branchId,
      );
    }

    if (!finalClassId) {
      return res.status(400).json({ error: 'No valid class found or provided' });
    }

    // Remove className and guardianEmail from data before creating
    const { className, guardianEmail, classId: _, ...studentData } = data;

    const student = await prisma.student.create({
      data: {
        ...studentData,
        classId: finalClassId,
        admissionNumber,
        status: 'ACTIVE',
        parentId,
        branchId: branchId,
      },
    });

    await syncStudentClassFees(student.id);

    res.status(201).json(student);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create student error:', error);
    res.status(500).json({ error: 'Failed to create student' });
  }
};

export const bulkCreateStudents = async (req: Request, res: Response) => {
  try {
    const studentsData = z.array(createStudentSchema).parse(req.body);
    const user = (req as AuthRequest).user;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (user.role !== 'SUPER_ADMIN' && !user.branchId) {
      return res.status(403).json({
        error: 'User does not belong to a branch and cannot import students.',
      });
    }

    const studentsWithBranches = studentsData.map(student => ({
      ...student,
      branchId: user.role === 'SUPER_ADMIN'
        ? (student.branchId || user.branchId)
        : user.branchId,
    }));

    // Get current academic term (most recent or active)
    const currentTerm = await prisma.academicTerm.findFirst({
      orderBy: { startDate: 'desc' }
    });

    if (!currentTerm) {
      return res.status(400).json({ error: 'No academic term found. Please create an academic term first.' });
    }

    // Get a default teacher (first teacher or super admin)
    const defaultTeacher = await prisma.user.findFirst({
      where: { role: { in: ['TEACHER', 'SUPER_ADMIN'] } }
    });

    if (!defaultTeacher) {
      return res.status(400).json({ error: 'No teacher found. Please create at least one teacher or admin user first.' });
    }

    // Fetch all existing classes for the current term
    const existingClasses = await prisma.class.findMany({
      where: { academicTermId: currentTerm.id }
    });

    const classMap = new Map(
      existingClasses.map(c => [classIdentityKey(c.name, c.branchId), c.id]),
    );

    // Pre-resolve and create missing classes once to avoid concurrent duplicates.
    const requestedClasses = new Map<string, { name: string; branchId?: string }>();
    for (const student of studentsWithBranches) {
      if (!student.classId && student.className) {
        const key = classIdentityKey(student.className, student.branchId);
        requestedClasses.set(key, { name: student.className, branchId: student.branchId });
      }
    }

    for (const [key, requestedClass] of requestedClasses) {
      if (classMap.has(key)) continue;

      const classId = await ensureClassExistsForTerm(
        requestedClass.name,
        currentTerm.id,
        defaultTeacher.id,
        requestedClass.branchId,
      );
      classMap.set(key, classId);
      console.log(`✅ Ensured class exists: ${requestedClass.name}`);
    }

    // Resolve classNames to classIds without creating classes in parallel loops.
    const studentsWithClassIds = studentsWithBranches.map((student) => {
      let classId = student.classId;
      if (student.className && !classId) {
        classId = classMap.get(classIdentityKey(student.className, student.branchId));
      }

      if (!classId) {
        throw new Error(`No valid class found for student: ${student.firstName} ${student.lastName}`);
      }

      return { ...student, classId };
    });

    // Generate admission numbers for those missing
    const year = new Date().getFullYear();

    // Find last admission number to start incrementing
    const lastStudent = await prisma.student.findFirst({
      where: { admissionNumber: { startsWith: `${year}-` } },
      orderBy: { admissionNumber: 'desc' }
    });

    let nextNum = 1;
    if (lastStudent) {
      const parts = lastStudent.admissionNumber.split('-');
      if (parts.length === 2) {
        const lastNum = parseInt(parts[1], 10);
        if (!isNaN(lastNum)) nextNum = lastNum + 1;
      }
    }

    const dataToCreate = studentsWithClassIds.map((s, index) => {
      let admissionNumber = s.admissionNumber;
      if (!admissionNumber) {
        admissionNumber = `${year}-${(nextNum + index).toString().padStart(4, '0')}`;
      }

      // Remove fields not in the database schema
      const { guardianEmail, className, classId, ...studentData } = s;

      // Ensure classId is defined (it should be from studentsWithClassIds)
      if (!classId) {
        throw new Error(`Missing classId for student: ${s.firstName} ${s.lastName}`);
      }

      return {
        ...studentData,
        classId: classId as string,
        admissionNumber: admissionNumber!,
        status: 'ACTIVE' as const
      };
    });

    const result = await prisma.student.createMany({
      data: dataToCreate,
      skipDuplicates: true,
    });

    const createdStudents = await prisma.student.findMany({
      where: {
        admissionNumber: { in: dataToCreate.map(student => student.admissionNumber) },
      },
      select: { id: true },
    });

    await Promise.all(createdStudents.map(student => syncStudentClassFees(student.id)));

    res.status(201).json({
      message: `Successfully imported ${result.count} students`,
      count: result.count,
      term: currentTerm.name
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Bulk create error:', error);
    res.status(500).json({ error: 'Failed to import students', details: error instanceof Error ? error.message : 'Unknown error' });
  }
};

export const bulkDeleteStudents = async (req: Request, res: Response) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(req.body);

    // Soft delete: Mark students as ARCHIVED instead of deleting
    const result = await prisma.student.updateMany({
      where: {
        id: { in: ids }
      },
      data: {
        status: 'ARCHIVED'
      }
    });

    res.json({ message: `Successfully archived ${result.count} students`, count: result.count });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Failed to archive students' });
  }
};

export const getStudentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthRequest;

    await ensureStudentRecordAccess(authReq, id);

    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        class: true,
        scholarship: true,
        payments: {
          orderBy: { paymentDate: 'desc' }
        },
        attendance: {
          take: 5,
          orderBy: { date: 'desc' }
        },
        feeStructures: {
          include: {
            feeTemplate: true
          }
        }
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (authReq.user?.role === 'TEACHER') {
      return res.json({
        ...student,
        scholarshipId: null,
        scholarship: null,
        payments: [],
        feeStructures: [],
      });
    }

    res.json(student);
  } catch (error) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to fetch student' });
  }
};

export const updateStudent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const parseResult = updateStudentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors });
    }

    const { reason, ...data } = parseResult.data;
    const userId = (req as any).user?.userId;

    // If class is changing, we need to log it
    if (data.classId) {
      const currentStudent = await prisma.student.findUnique({
        where: { id },
        select: { classId: true }
      });

      if (currentStudent && currentStudent.classId !== data.classId) {
        await prisma.classMovementLog.create({
          data: {
            studentId: id,
            fromClassId: currentStudent.classId,
            toClassId: data.classId,
            reason: reason || 'Class update',
            changedByUserId: userId
          }
        });
      }
    }

    const student = await prisma.student.update({
      where: { id },
      data,
    });

    if (data.classId) {
      await syncStudentClassFees(student.id);
    }

    res.json(student);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to update student' });
  }
};

export const deleteStudent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify student exists
    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Soft delete: Mark student as ARCHIVED instead of deleting
    await prisma.student.update({
      where: { id },
      data: { status: 'ARCHIVED' }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({ error: 'Failed to archive student' });
  }
};

export const getMyChildren = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    // Get Active Term
    const activeTerm = await prisma.academicTerm.findFirst({
      where: { isActive: true }
    });

    const students = await prisma.student.findMany({
      where: {
        parentId: userId
      },
      include: {
        class: true,
        attendance: {
          take: 5,
          orderBy: { date: 'desc' }
        },
        payments: {
          orderBy: { paymentDate: 'desc' }
        },
        feeStructures: {
          include: {
            feeTemplate: true
          }
        },
        assessmentResults: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            assessment: {
              include: {
                subject: true
              }
            }
          }
        },
        termResults: {
          include: {
            subject: true,
            term: true
          },
          orderBy: {
            term: { startDate: 'asc' }
          }
        },
        termReports: {
          include: {
            term: true
          },
          orderBy: {
            term: { startDate: 'desc' }
          }
        }
      }
    });

    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const todayName = days[new Date().getDay()];

    const studentIds = students.map(student => student.id);
    const classIds = [...new Set(students.map(student => student.classId))];
    const pendingAssessmentsByStudent = new Map<string, any[]>();
    const todaysClassesByClass = new Map<string, any[]>();

    if (activeTerm && classIds.length > 0 && studentIds.length > 0) {
      const assessmentWindowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const assessments = await prisma.assessment.findMany({
        where: {
          classId: { in: classIds },
          termId: activeTerm.id,
          date: { gte: assessmentWindowStart },
        },
        include: { subject: true },
        orderBy: { date: 'asc' },
      });

      const assessmentsByClass = new Map<string, any[]>();
      for (const assessment of assessments) {
        const current = assessmentsByClass.get(assessment.classId) || [];
        current.push(assessment);
        assessmentsByClass.set(assessment.classId, current);
      }

      const assessmentIds = assessments.map(a => a.id);
      const gradedRows = assessmentIds.length > 0
        ? await prisma.assessmentResult.findMany({
            where: {
              assessmentId: { in: assessmentIds },
              studentId: { in: studentIds },
            },
            select: { assessmentId: true, studentId: true },
          })
        : [];

      const gradedSet = new Set(gradedRows.map(r => `${r.assessmentId}:${r.studentId}`));
      for (const student of students) {
        const classAssessments = assessmentsByClass.get(student.classId) || [];
        pendingAssessmentsByStudent.set(
          student.id,
          classAssessments.filter((assessment: any) => !gradedSet.has(`${assessment.id}:${student.id}`))
        );
      }

      if (['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].includes(todayName)) {
        const periodLinks = await prisma.timetablePeriodClass.findMany({
          where: {
            classId: { in: classIds },
            timetablePeriod: {
              academicTermId: activeTerm.id,
              dayOfWeek: todayName as any,
            },
          },
          include: {
            timetablePeriod: {
              include: { subject: true },
            },
          },
          orderBy: {
            timetablePeriod: { startTime: 'asc' },
          },
        });

        for (const link of periodLinks) {
          const current = todaysClassesByClass.get(link.classId) || [];
          current.push(link.timetablePeriod);
          todaysClassesByClass.set(link.classId, current);
        }
      }
    }

    const studentsWithExtras = await Promise.all(students.map(async (student) => {
      // 1. Balance Calculation
      const totalFees = student.feeStructures.reduce((sum, fee) => sum + Number(fee.amountDue), 0);
      const totalPaid = student.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const balance = totalFees - totalPaid;

      // 2. Pending/Upcoming Assessments (Last 7 days to Future)
      const pendingAssessments = pendingAssessmentsByStudent.get(student.id) || [];
      const todaysClasses = todaysClassesByClass.get(student.classId) || [];

      // We only want to send the last 5 payments
      const recentPayments = student.payments.slice(0, 5);

      return {
        ...student,
        payments: recentPayments,
        balance,
        pendingAssessments,
        todaysClasses
      };
    }));

    res.json(studentsWithExtras);
  } catch (error) {
    console.error('Get my children error:', error);
    res.status(500).json({ error: 'Failed to fetch children' });
  }
};

export const getStudentProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const student = await prisma.student.findUnique({
      where: { userId },
      include: {
        class: true
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    res.json(student);
  } catch (error) {
    console.error('Get student profile error:', error);
    res.status(500).json({ error: 'Failed to fetch student profile' });
  }
};
