import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { sendEmail } from '../services/emailService';

const prisma = new PrismaClient();

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
              <h2 style="color: #2563eb;">Welcome to Sync School Management</h2>
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
      const currentTerm = await prisma.academicTerm.findFirst({
        orderBy: { startDate: 'desc' }
      });

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
        const newClass = await prisma.class.create({
          data: {
            name: normalizedName,
            gradeLevel,
            teacherId: defaultTeacher.id,
            academicTermId: currentTerm.id,
            branchId: branchId // Assign new class to the same branch
          }
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

            const newClass = await prisma.class.create({
              data: {
                name: normalizedName,
                gradeLevel,
                teacherId: defaultTeacher.id,
                academicTermId: currentTerm.id,
              }
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

    const result = await prisma.student.createMany({
      data: dataToCreate,
      skipDuplicates: true,
    });

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

    res.json(student);
  } catch (error) {
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

    const studentsWithExtras = await Promise.all(students.map(async (student) => {
      // 1. Balance Calculation
      const totalFees = student.feeStructures.reduce((sum, fee) => sum + Number(fee.amountDue), 0);
      const totalPaid = student.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const balance = totalFees - totalPaid;

      // 2. Pending/Upcoming Assessments (Last 7 days to Future)
      let pendingAssessments: any[] = [];
      let todaysClasses: any[] = [];

      if (activeTerm) {
        // Find assessments for the class
        const assessments = await prisma.assessment.findMany({
          where: {
            classId: student.classId,
            termId: activeTerm.id,
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
              academicTermId: activeTerm.id,
              dayOfWeek: todayName as any,
              classes: {
                some: {
                  classId: student.classId
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
