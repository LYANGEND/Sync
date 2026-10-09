import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { sendEmail } from '../services/emailService';
import { syncStudentClassFees } from '../services/classFeeAssignmentService';
import { AcademicScopeError, ensureStudentRecordAccess } from '../utils/academicScope';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  assertTermWriteAllowed,
  getActiveTerm,
  runTermLifecycleTransaction,
  runTermWriteTransaction,
  TermLifecycleError,
} from '../services/termLifecycleService';
import { sendTermLifecycleError } from '../utils/termLifecycleHttp';
import {
  getStudentPlacementForTerm,
  StudentPlacementError,
  upsertStudentPlacement,
} from '../services/studentPlacementService';
import {
  candidateToRecord,
  hasLikelySameStudent,
  loadStudentMatchPool,
  StudentMatch,
} from '../services/studentDuplicateService';
import { logAuditEvent } from '../middleware/auditMiddleware';

const optionalText = z.string().nullable().optional().transform(val => (val ? val : undefined));

const duplicateCheckSchema = z.object({
  firstName: z.string().default(''),
  lastName: z.string().default(''),
  dateOfBirth: optionalText,
  guardianName: optionalText,
  guardianPhone: optionalText,
  guardianEmail: optionalText,
  excludeStudentId: z.string().uuid().optional(),
});

// Non-admins only see matches inside their own branch, mirroring GET /students scoping.
const duplicateScopeBranchId = (user: { role?: string; branchId?: string | null }) => (
  user.role === 'SUPER_ADMIN' ? undefined : user.branchId ?? undefined
);

const sendDuplicateConflict = (res: Response, matches: StudentMatch[]) => res.status(409).json({
  code: 'POSSIBLE_DUPLICATE_STUDENT',
  error: 'This student may already exist. Review the matches and confirm before creating.',
  matches,
});

export const checkStudentDuplicates = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN' && !user.branchId) {
      return res.status(403).json({ error: 'User does not belong to a branch.' });
    }
    const { excludeStudentId, ...candidate } = duplicateCheckSchema.parse(req.body);
    const pool = await loadStudentMatchPool({ branchId: duplicateScopeBranchId(user), excludeStudentId });
    res.json({ matches: pool.match(candidate) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Student duplicate check error:', error);
    res.status(500).json({ error: 'Failed to check for existing students' });
  }
};

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
  academicTermId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'DROPPED_OUT']).optional(),
  reason: z.string().optional(), // For audit trail
});

const archiveStudentsWithoutActivePlacement = async (ids: string[]) => (
  runTermLifecycleTransaction(async tx => {
    const students = await tx.student.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        termEnrollments: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
      },
    });

    const blockedStudentIds = students
      .filter(student => student.termEnrollments.length > 0)
      .map(student => student.id);

    if (blockedStudentIds.length > 0) {
      return {
        kind: 'ACTIVE_PLACEMENT' as const,
        studentIds: blockedStudentIds,
      };
    }

    const result = await tx.student.updateMany({
      where: { id: { in: students.map(student => student.id) } },
      data: { status: 'ARCHIVED' },
    });

    return {
      kind: 'ARCHIVED' as const,
      count: result.count,
      foundIds: students.map(student => student.id),
    };
  })
);

export const getStudents = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userRole = user?.role;
    const userId = user?.userId;
    const userBranchId = user?.branchId; // Assumes branchId is in the token or attached by middleware
    const academicTermId = z.string().uuid().parse(req.query.academicTermId);
    const includeUnplaced = req.query.includeUnplaced === 'true';

    if (includeUnplaced && !['SUPER_ADMIN', 'SECRETARY'].includes(userRole)) {
      return res.status(403).json({ error: 'Only student placement administrators can include unplaced identities' });
    }

    // Base filter: always exclude archived students
    let whereClause: any = {
      status: { not: 'ARCHIVED' },
      ...(!includeUnplaced && { termEnrollments: { some: { academicTermId } } }),
    };

    // Branch Scoping: If not SUPER_ADMIN, restrict to user's branch
    if (userRole !== 'SUPER_ADMIN' && userBranchId) {
      whereClause.branchId = userBranchId;
    } else if (userRole === 'SUPER_ADMIN' && typeof req.query.branchId === 'string') {
      whereClause.branchId = req.query.branchId;
    }

    if (userRole === 'TEACHER') {
      const myClasses = await prisma.class.findMany({
        where: {
          academicTermId,
          OR: [
            { teacherId: userId },
            { teacherAssignments: { some: { teacherId: userId } } },
          ],
        },
        select: { id: true }
      });

      const classIds = myClasses.map(c => c.id);

      // Teachers see students in their classes AND belong to their branch (already filtered above)
      whereClause = {
        ...whereClause,
        termEnrollments: {
          some: { academicTermId, classId: { in: classIds } },
        },
      };
    } else if (userRole === 'PARENT') {
      whereClause.parentId = userId;
    } else if (userRole === 'STUDENT') {
      whereClause.userId = userId;
    } else if (typeof req.query.parentId === 'string') {
      whereClause.parentId = req.query.parentId;
    }

    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      // Each word must match a field, so "John Banda" finds first + last name together.
      whereClause.AND = req.query.search.trim().split(/\s+/).map(token => ({
        OR: [
          { firstName: { contains: token, mode: 'insensitive' } },
          { lastName: { contains: token, mode: 'insensitive' } },
          { admissionNumber: { contains: token, mode: 'insensitive' } },
          { guardianName: { contains: token, mode: 'insensitive' } },
          { guardianPhone: { contains: token } },
        ],
      }));
    }

    const students = await prisma.student.findMany({
      where: whereClause,
      include: {
        branch: true,
        termEnrollments: {
          where: { academicTermId },
          include: { class: true },
          take: 1,
        },
      },
      orderBy: {
        lastName: 'asc',
      },
    });
    res.json(students.map(({ termEnrollments, ...student }) => {
      const placement = termEnrollments[0];
      return {
        ...student,
        classId: placement?.classId ?? null,
        class: placement?.class ?? null,
        placementStatus: placement?.status ?? null,
      };
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Academic term ID is required' });
    }
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

    if (data.classId) {
      const requestedClass = await prisma.class.findUnique({
        where: { id: data.classId },
        select: { academicTermId: true, academicTerm: { select: { status: true } } },
      });
      if (!requestedClass) return res.status(404).json({ error: 'Class not found' });
      if (requestedClass.academicTerm.status !== 'ACTIVE') {
        return res.status(409).json({
          code: 'INITIAL_PLACEMENT_REQUIRES_ACTIVE_TERM',
          error: 'Create the student in the active term, then stage future placement from class management',
        });
      }
      await assertTermWriteAllowed(requestedClass.academicTermId, 'ACADEMIC_ACTIVITY');
    }

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

    // Checked before any parent account is created so a rejected duplicate leaves no side effects.
    const duplicateConfirmed = req.body?.confirmDuplicate === true;
    const duplicatePool = await loadStudentMatchPool({ branchId: duplicateScopeBranchId(user) });
    const duplicateMatches = duplicatePool.match(data);
    if (hasLikelySameStudent(duplicateMatches) && !duplicateConfirmed) {
      return sendDuplicateConflict(res, duplicateMatches);
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
      const existingParent = await prisma.user.findUnique({
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
              <h2 style="color: #0047AB;">Welcome to Sync — Run your school. In sync.</h2>
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
            const retryParent = await prisma.user.findUnique({
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
      const currentTerm = await getActiveTerm();

      if (!currentTerm) {
        return res.status(400).json({ error: 'No academic term found. Please create an academic term first.' });
      }

      // Try to find the class by name
      const existingClass = await prisma.class.findFirst({
        where: {
          name: {
            equals: data.className.trim(),
            mode: 'insensitive'
          },
          academicTermId: currentTerm.id
        }
      });

      if (existingClass) {
        finalClassId = existingClass.id;
      } else {
        // Get a default teacher for the new class
        const defaultTeacher = await prisma.user.findFirst({
          where: { role: { in: ['TEACHER', 'SUPER_ADMIN'] } }
        });

        if (!defaultTeacher) {
          return res.status(400).json({ error: 'No teacher found. Please create at least one teacher or admin user first.' });
        }

        // Determine grade level from class name
        const normalizedName = data.className.trim();
        let gradeLevel = 0;
        if (normalizedName.toLowerCase().includes('baby')) gradeLevel = -2;
        else if (normalizedName.toLowerCase().includes('middle')) gradeLevel = -1;
        else if (normalizedName.toLowerCase().includes('day care') || normalizedName.toLowerCase().includes('reception')) gradeLevel = 0;
        else {
          const gradeMatch = normalizedName.match(/grade\s+(\w+)/i);
          if (gradeMatch) {
            const gradeWord = gradeMatch[1].toLowerCase();
            const gradeNumbers: { [key: string]: number } = {
              'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
              'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
              'eleven': 11, 'twelve': 12,
              '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
              '7': 7, '8': 8, '9': 9, '10': 10, '11': 11, '12': 12
            };
            gradeLevel = gradeNumbers[gradeWord] || 0;
          }
        }

        // Create the class
        const newClass = await runTermWriteTransaction(currentTerm.id, 'SETUP', async tx => {
          const concurrentClass = await tx.class.findFirst({
            where: {
              name: { equals: normalizedName, mode: 'insensitive' },
              academicTermId: currentTerm.id,
              branchId,
            },
          });
          return concurrentClass ?? tx.class.create({
            data: {
              name: normalizedName,
              gradeLevel,
              teacherId: defaultTeacher.id,
              academicTermId: currentTerm.id,
              branchId,
            }
          });
        });

        finalClassId = newClass.id;
        console.log(`✅ Created new class: ${normalizedName} (Grade Level: ${gradeLevel})`);
      }
    }

    if (!finalClassId) {
      return res.status(400).json({ error: 'No valid class found or provided' });
    }

    // Remove className and guardianEmail from data before creating
    const { className, guardianEmail, classId: _, ...studentData } = data;

    const targetClass = await prisma.class.findUnique({
      where: { id: finalClassId },
      select: { academicTermId: true, academicTerm: { select: { status: true } } },
    });
    if (!targetClass) return res.status(404).json({ error: 'Class not found' });
    if (targetClass.academicTerm.status !== 'ACTIVE') {
      return res.status(409).json({
        code: 'INITIAL_PLACEMENT_REQUIRES_ACTIVE_TERM',
        error: 'Initial student placement is only allowed in the active term',
      });
    }

    const student = await runTermWriteTransaction(targetClass.academicTermId, 'ACADEMIC_ACTIVITY', async tx => {
      const createdStudent = await tx.student.create({
        data: {
          ...studentData,
          classId: finalClassId,
          admissionNumber,
          status: 'ACTIVE',
          parentId,
          branchId,
        },
      });
      await upsertStudentPlacement(tx, {
        studentId: createdStudent.id,
        academicTermId: targetClass.academicTermId,
        classId: finalClassId,
        status: 'ACTIVE',
        changedByUserId: user.userId,
        movementReason: 'Initial student placement',
      });
      return createdStudent;
    });

    await syncStudentClassFees(student.id);

    if (hasLikelySameStudent(duplicateMatches)) {
      await logAuditEvent({
        userId: user.userId,
        action: 'DUPLICATE_OVERRIDE',
        entityType: 'Student',
        entityId: student.id,
        newValue: {
          reason: 'Created despite likely duplicate match',
          matchedStudentIds: duplicateMatches
            .filter(match => match.strength === 'LIKELY_SAME')
            .map(match => match.student.id),
        },
        ipAddress: req.ip ?? null,
        userAgent: req.get('User-Agent') ?? null,
      });
    }

    res.status(201).json(student);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof StudentPlacementError) {
      return res.status(error.status).json({ code: error.code, error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Create student error:', error);
    res.status(500).json({ error: 'Failed to create student' });
  }
};

export const bulkCreateStudents = async (req: Request, res: Response) => {
  try {
    const studentsData = z.array(createStudentSchema).parse(req.body);
    const bulkUser = (req as AuthRequest).user ?? {};

    // Each row is checked against existing students and against earlier rows in the same file.
    if (req.query.allowDuplicates !== 'true') {
      const pool = await loadStudentMatchPool({ branchId: duplicateScopeBranchId(bulkUser) });
      const duplicateRows = studentsData.flatMap((row, index) => {
        const rowMatches = pool.match(row).filter(match => match.strength === 'LIKELY_SAME');
        pool.add(candidateToRecord(row, `Import row ${index + 1}`));
        return rowMatches.length > 0
          ? [{ row: index + 1, firstName: row.firstName, lastName: row.lastName, matches: rowMatches }]
          : [];
      });
      if (duplicateRows.length > 0) {
        return res.status(409).json({
          code: 'POSSIBLE_DUPLICATE_STUDENTS',
          error: `${duplicateRows.length} row(s) may already exist. Review them before importing.`,
          duplicates: duplicateRows,
        });
      }
    }

    // Get current academic term (most recent or active)
    const currentTerm = await getActiveTerm();

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

    const classMap = new Map(existingClasses.map(c => [c.name.toLowerCase(), c.id]));
    const classIdMap = new Map(existingClasses.map(c => [c.id, c]));

    // Resolve classNames to classIds and create missing classes
    const studentsWithClassIds = await Promise.all(
      studentsData.map(async (student) => {
        let classId = student.classId;

        // If className is provided, try to find or create the class
        if (student.className && !classId) {
          const normalizedName = student.className.trim();
          classId = classMap.get(normalizedName.toLowerCase());

          // If class doesn't exist, create it
          if (!classId) {
            // Determine grade level from class name
            let gradeLevel = 0;
            if (normalizedName.toLowerCase().includes('baby')) gradeLevel = -2;
            else if (normalizedName.toLowerCase().includes('middle')) gradeLevel = -1;
            else if (normalizedName.toLowerCase().includes('day care') || normalizedName.toLowerCase().includes('reception')) gradeLevel = 0;
            else {
              const gradeMatch = normalizedName.match(/grade\s+(\w+)/i);
              if (gradeMatch) {
                const gradeWord = gradeMatch[1].toLowerCase();
                const gradeNumbers: { [key: string]: number } = {
                  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
                  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
                  'eleven': 11, 'twelve': 12,
                  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
                  '7': 7, '8': 8, '9': 9, '10': 10, '11': 11, '12': 12
                };
                gradeLevel = gradeNumbers[gradeWord] || 0;
              }
            }

            const newClass = await runTermWriteTransaction(currentTerm.id, 'SETUP', async tx => {
              const concurrentClass = await tx.class.findFirst({
                where: {
                  name: { equals: normalizedName, mode: 'insensitive' },
                  academicTermId: currentTerm.id,
                },
              });
              return concurrentClass ?? tx.class.create({
                data: {
                  name: normalizedName,
                  gradeLevel,
                  teacherId: defaultTeacher.id,
                  academicTermId: currentTerm.id,
                }
              });
            });

            classId = newClass.id;
            classMap.set(normalizedName.toLowerCase(), classId);
            console.log(`✅ Created new class: ${normalizedName} (Grade Level: ${gradeLevel})`);
          }
        }

        // Validate that we have a classId
        if (!classId) {
          throw new Error(`No valid class found for student: ${student.firstName} ${student.lastName}`);
        }

        return { ...student, classId };
      })
    );

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

    const targetClassIds = [...new Set(dataToCreate.map(student => student.classId))];
    const validTargetClassCount = await prisma.class.count({
      where: { id: { in: targetClassIds }, academicTermId: currentTerm.id },
    });
    if (validTargetClassCount !== targetClassIds.length) {
      return res.status(400).json({ error: 'Every student class must belong to the active academic term' });
    }

    const { result, createdStudents } = await runTermWriteTransaction(currentTerm.id, 'ACADEMIC_ACTIVITY', async tx => {
      const result = await tx.student.createMany({
        data: dataToCreate,
        skipDuplicates: true,
      });
      const createdStudents = await tx.student.findMany({
        where: {
          admissionNumber: { in: dataToCreate.map(student => student.admissionNumber) },
        },
        select: { id: true, admissionNumber: true },
      });
      const classIdByAdmissionNumber = new Map(
        dataToCreate.map(student => [student.admissionNumber, student.classId]),
      );
      await Promise.all(createdStudents.map(student => upsertStudentPlacement(tx, {
        studentId: student.id,
        academicTermId: currentTerm.id,
        classId: classIdByAdmissionNumber.get(student.admissionNumber)!,
        status: 'ACTIVE',
        changedByUserId: (req as AuthRequest).user?.userId,
        movementReason: 'Bulk student import',
      })));
      return { result, createdStudents };
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
    if (error instanceof StudentPlacementError) {
      return res.status(error.status).json({ code: error.code, error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Bulk create error:', error);
    res.status(500).json({ error: 'Failed to import students', details: error instanceof Error ? error.message : 'Unknown error' });
  }
};

export const bulkDeleteStudents = async (req: Request, res: Response) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(req.body);

    const result = await archiveStudentsWithoutActivePlacement(ids);
    if (result.kind === 'ACTIVE_PLACEMENT') {
      return res.status(409).json({
        code: 'ACTIVE_PLACEMENT_ARCHIVE_FORBIDDEN',
        error: 'Students with an active placement must be transferred or withdrawn before archival',
        studentIds: result.studentIds,
      });
    }

    res.json({ message: `Successfully archived ${result.count} students`, count: result.count });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Failed to archive students' });
  }
};

export const getStudentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const academicTermId = z.string().uuid().parse(req.query.academicTermId);
    const authReq = req as AuthRequest;

    await ensureStudentRecordAccess(authReq, id, { academicTermId });

    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        termEnrollments: {
          where: { academicTermId },
          include: { class: true },
          take: 1,
        },
        scholarship: true,
        payments: {
          where: { academicTermId, status: 'COMPLETED' },
          orderBy: { paymentDate: 'desc' }
        },
        attendance: {
          where: { academicTermId },
          take: 5,
          orderBy: { date: 'desc' }
        },
        feeStructures: {
          where: { academicTermId },
          include: {
            feeTemplate: true
          }
        }
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const { termEnrollments, ...studentIdentity } = student;
    const placement = termEnrollments[0];
    const termScopedStudent = {
      ...studentIdentity,
      classId: placement?.classId ?? null,
      class: placement?.class ?? null,
      placementStatus: placement?.status ?? null,
    };

    if (authReq.user?.role === 'TEACHER') {
      return res.json({
        ...termScopedStudent,
        scholarshipId: null,
        scholarship: null,
        payments: [],
        feeStructures: [],
      });
    }

    res.json(termScopedStudent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Academic term ID is required' });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof StudentPlacementError) {
      return res.status(error.status).json({ code: error.code, error: error.message });
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

    const { reason, academicTermId, classId, ...data } = parseResult.data;
    const userId = (req as any).user?.userId;
    const placementMutationRequested = Boolean(classId || data.status);
    if (placementMutationRequested && !academicTermId) {
      return res.status(400).json({ error: 'Academic term ID is required for placement changes' });
    }

    const currentStudent = placementMutationRequested || data.branchId
      ? await prisma.student.findUnique({
        where: { id },
        select: {
          branchId: true,
          status: true,
        },
      })
      : null;
    if ((placementMutationRequested || data.branchId) && !currentStudent) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (data.branchId && data.branchId !== currentStudent?.branchId) {
      return res.status(409).json({
        code: 'BRANCH_TRANSFER_REQUIRED',
        error: 'Student branch changes must use the branch transfer workflow',
      });
    }

    const statusIsChanging = Boolean(
      data.status && currentStudent && data.status !== currentStudent.status,
    );
    if (statusIsChanging && (
      currentStudent!.status !== 'ACTIVE'
      || !['TRANSFERRED', 'DROPPED_OUT'].includes(data.status!)
    )) {
      return res.status(409).json({
        code: 'ROLLOVER_DECISION_REQUIRED',
        error: 'Graduation and student reactivation must be staged through the term rollover workflow',
      });
    }
    if (classId && currentStudent && currentStudent.status !== 'ACTIVE') {
      return res.status(409).json({
        code: 'ROLLOVER_DECISION_REQUIRED',
        error: 'Inactive students cannot be moved through the legacy class update endpoint',
      });
    }

    if (classId && statusIsChanging) {
      return res.status(400).json({ error: 'Class movement and withdrawal must be completed separately' });
    }

    let student;

    // Class and active-placement status changes are term-owned and must stay atomic.
    if (placementMutationRequested) {
      const currentEnrollment = await getStudentPlacementForTerm(id, academicTermId!);
      if (!currentEnrollment) {
        return res.status(409).json({
          code: 'TERM_PLACEMENT_REQUIRED',
          error: 'Student has no placement in the selected academic term',
        });
      }
      if (currentEnrollment.status !== 'ACTIVE') {
        return res.status(409).json({
          code: 'ACTIVE_PLACEMENT_REQUIRED',
          error: 'Only an active term placement can be changed through this endpoint',
        });
      }

      const targetClass = classId
        ? await prisma.class.findUnique({
          where: { id: classId },
          select: { academicTermId: true },
        })
        : null;

      if (classId && !targetClass) return res.status(404).json({ error: 'Class not found' });
      if (targetClass && targetClass.academicTermId !== academicTermId) {
        return res.status(400).json({ error: 'Target class does not belong to the selected academic term' });
      }

      student = await runTermWriteTransaction(academicTermId!, 'ACADEMIC_ACTIVITY', async tx => {
        const lockedEnrollment = await tx.studentTermEnrollment.findUnique({
          where: {
            studentId_academicTermId: {
              studentId: id,
              academicTermId: academicTermId!,
            },
          },
          include: { academicTerm: { select: { endDate: true } } },
        });
        if (!lockedEnrollment
          || lockedEnrollment.id !== currentEnrollment.id
          || lockedEnrollment.classId !== currentEnrollment.classId
          || lockedEnrollment.status !== 'ACTIVE') {
          throw new AcademicScopeError(409, 'Student placement changed while the update was being processed');
        }

        if (classId && classId !== lockedEnrollment.classId) {
          await upsertStudentPlacement(tx, {
            studentId: id,
            academicTermId: academicTermId!,
            classId,
            status: 'ACTIVE',
            changedByUserId: userId,
            movementReason: reason || 'Class update',
          });
        }
        if (statusIsChanging) {
          const requestedEnd = new Date();
          const endsAt = new Date(Math.min(
            Math.max(requestedEnd.getTime(), lockedEnrollment.startsAt.getTime()),
            lockedEnrollment.academicTerm.endDate.getTime(),
          ));
          await tx.studentTermEnrollment.update({
            where: { id: lockedEnrollment.id },
            data: {
              status: data.status === 'TRANSFERRED' ? 'TRANSFERRED' : 'WITHDRAWN',
              endsAt,
              notes: reason || undefined,
            },
          });
        }
        return tx.student.update({ where: { id }, data });
      });
    } else {
      student = await prisma.student.update({ where: { id }, data });
    }

    if (classId) {
      await syncStudentClassFees(student.id);
    }

    res.json(student);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof StudentPlacementError) {
      return res.status(error.status).json({ code: error.code, error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Update student error:', error);
    res.status(500).json({ error: 'Failed to update student' });
  }
};

export const deleteStudent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await archiveStudentsWithoutActivePlacement([id]);
    if (result.kind === 'ACTIVE_PLACEMENT') {
      return res.status(409).json({
        code: 'ACTIVE_PLACEMENT_ARCHIVE_FORBIDDEN',
        error: 'A student with an active placement must be transferred or withdrawn before archival',
      });
    }
    if (!result.foundIds.includes(id)) return res.status(404).json({ error: 'Student not found' });

    res.status(204).send();
  } catch (error) {
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Delete student error:', error);
    res.status(500).json({ error: 'Failed to archive student' });
  }
};

export const getMyChildren = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : undefined;

    if (!academicTermId) {
      return res.status(400).json({ error: 'Academic term ID is required' });
    }

    const selectedTerm = await prisma.academicTerm.findUnique({
      where: { id: academicTermId }
    });

    if (!selectedTerm) {
      return res.status(404).json({ error: 'Academic term not found' });
    }

    const students = await prisma.student.findMany({
      where: {
        parentId: userId
      },
      include: {
        termEnrollments: {
          where: { academicTermId },
          include: { class: true },
          take: 1,
        },
        attendance: {
          where: { academicTermId },
          take: 5,
          orderBy: { date: 'desc' }
        },
        payments: {
          where: { academicTermId, status: 'COMPLETED' },
          orderBy: { paymentDate: 'desc' }
        },
        feeStructures: {
          where: { academicTermId },
          include: {
            feeTemplate: true
          }
        },
        assessmentResults: {
          where: { assessment: { termId: academicTermId } },
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
          where: { termId: academicTermId },
          include: {
            subject: true,
            term: true,
            class: true
          },
          orderBy: {
            term: { startDate: 'asc' }
          }
        },
        termReports: {
          where: { termId: academicTermId },
          include: {
            term: true,
            class: true
          },
          orderBy: {
            term: { startDate: 'desc' }
          }
        }
      }
    });

    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const todayName = days[new Date().getDay()];

    const studentsWithExtras = await Promise.all(students.map(async (student) => {
      const selectedPlacement = student.termEnrollments[0];
      const selectedClass = selectedPlacement?.class ?? null;
      const selectedClassId = selectedClass?.id;

      // 1. Balance Calculation
      const totalFees = student.feeStructures.reduce((sum, fee) => sum + Number(fee.amountDue), 0);
      const totalPaid = student.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const balance = totalFees - totalPaid;

      // 2. Pending/Upcoming Assessments (Last 7 days to Future)
      let pendingAssessments: any[] = [];
      let todaysClasses: any[] = [];

      if (selectedClassId) {
        // Find assessments for the class
        const assessments = await prisma.assessment.findMany({
          where: {
            classId: selectedClassId,
            termId: selectedTerm.id,
            date: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Include recent ones
            }
          },
          include: { subject: true },
          orderBy: { date: 'asc' }
        });

        // Filter out those already graded (present in assessmentResults)
        // Note: This matches "Pending Grading" or "Pending Submission"
        for (const assessment of assessments) {
          // Check if result exists (Graded)
          const result = await prisma.assessmentResult.findUnique({
            where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: student.id } }
          });

          if (!result) {
            // Check if submitted but not graded? (Schema has AssessmentSubmission)
            // For now, simpler: if no Result, show it as Pending/Upcoming
            pendingAssessments.push(assessment);
          }
        }

        // 3. Timetable for Today
        if (['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].includes(todayName)) {
          todaysClasses = await prisma.timetablePeriod.findMany({
            where: {
              academicTermId: selectedTerm.id,
              dayOfWeek: todayName as any,
              classes: {
                some: {
                  classId: selectedClassId
                }
              }
            },
            include: { subject: true },
            orderBy: { startTime: 'asc' }
          });
        }
      }

      // We only want to send the last 5 payments
      const recentPayments = student.payments.slice(0, 5);

      return {
        ...student,
        termEnrollments: undefined,
        classId: selectedPlacement?.classId ?? null,
        class: selectedClass,
        placementStatus: selectedPlacement?.status ?? null,
        payments: recentPayments,
        balance,
        academicTerm: selectedTerm,
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

    const academicTermId = z.string().uuid().parse(req.query.academicTermId);
    const student = await prisma.student.findUnique({
      where: { userId },
      include: {
        termEnrollments: {
          where: { academicTermId },
          include: { class: true },
          take: 1,
        },
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const { termEnrollments, ...identity } = student;
    const placement = termEnrollments[0];
    res.json({
      ...identity,
      classId: placement?.classId ?? null,
      class: placement?.class ?? null,
      placementStatus: placement?.status ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Academic term ID is required' });
    }
    console.error('Get student profile error:', error);
    res.status(500).json({ error: 'Failed to fetch student profile' });
  }
};
