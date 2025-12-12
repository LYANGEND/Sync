import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { sendEmail } from '../services/emailService';

const prisma = new PrismaClient();

const createStudentSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  admissionNumber: z.string().optional(),
  dateOfBirth: z.string().transform((str) => new Date(str)),
  gender: z.enum(['MALE', 'FEMALE']),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  guardianEmail: z.string().email().optional(),
  address: z.string().optional(),
  classId: z.string().uuid(),
  scholarshipId: z.string().uuid().optional().nullable(),
});

const updateStudentSchema = createStudentSchema.partial().extend({
  status: z.enum(['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'DROPPED_OUT']).optional(),
  reason: z.string().optional(), // For audit trail
});

export const getStudents = async (req: Request, res: Response) => {
  try {
    const students = await prisma.student.findMany({
      include: {
        class: true,
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
    const data = createStudentSchema.parse(req.body);
    
    let parentId: string | null = null;

    // Auto-generate admission number if not provided
    let admissionNumber = data.admissionNumber;
    if (!admissionNumber) {
      const year = new Date().getFullYear();
      // Find the last student created this year to increment the number
      const lastStudent = await prisma.student.findFirst({
        where: {
          admissionNumber: {
            startsWith: `${year}-`
          }
        },
        orderBy: {
          admissionNumber: 'desc'
        }
      });

      let nextNum = 1;
      if (lastStudent) {
        const parts = lastStudent.admissionNumber.split('-');
        if (parts.length === 2) {
          const lastNum = parseInt(parts[1], 10);
          if (!isNaN(lastNum)) {
            nextNum = lastNum + 1;
          }
        }
      }
      
      admissionNumber = `${year}-${nextNum.toString().padStart(4, '0')}`;
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
    } else {
      console.log('DEBUG: No guardian email provided');
    }

    const student = await prisma.student.create({
      data: {
        ...data,
        admissionNumber,
        status: 'ACTIVE',
        parentId,
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

    // Collect unique class IDs from the import data
    const uniqueClassIds = [...new Set(studentsData.map(s => s.classId))];
    
    // Fetch existing classes
    const existingClasses = await prisma.class.findMany({
      where: { id: { in: uniqueClassIds } }
    });
    
    const existingClassIds = new Set(existingClasses.map(c => c.id));
    const missingClassIds = uniqueClassIds.filter(id => !existingClassIds.has(id));

    // If there are missing classes, we need to check if they're being provided by name
    // For now, we'll just report which class IDs are missing
    if (missingClassIds.length > 0) {
      return res.status(400).json({ 
        error: `The following class IDs do not exist: ${missingClassIds.join(', ')}. Please create these classes first or provide valid class IDs.` 
      });
    }
    
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

    const dataToCreate = studentsData.map((s, index) => {
      let admissionNumber = s.admissionNumber;
      if (!admissionNumber) {
        admissionNumber = `${year}-${(nextNum + index).toString().padStart(4, '0')}`;
      }
      
      // Remove guardianEmail from the object passed to createMany as it might not be in the DB schema yet
      // and createMany doesn't support creating relations anyway.
      const { guardianEmail, ...studentData } = s;
      
      return {
        ...studentData,
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
    res.status(500).json({ error: 'Failed to import students' });
  }
};

export const bulkDeleteStudents = async (req: Request, res: Response) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(req.body);
    
    const result = await prisma.student.deleteMany({
      where: {
        id: {
          in: ids
        }
      }
    });
    
    res.json({ message: `Successfully deleted ${result.count} students`, count: result.count });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Failed to delete students' });
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
    const { reason, ...data } = updateStudentSchema.parse(req.body);
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
    
    // 1. Get student to find parent
    const student = await prisma.student.findUnique({
      where: { id },
      select: { parentId: true }
    });

    if (!student) return res.status(404).json({ error: 'Student not found' });

    // 2. Delete student
    await prisma.student.delete({
      where: { id },
    });

    // 3. Check parent
    if (student.parentId) {
      const remainingChildren = await prisma.student.count({
        where: { parentId: student.parentId }
      });

      if (remainingChildren === 0) {
        try {
           await prisma.user.delete({ where: { id: student.parentId } });
           console.log(`Deleted orphan parent account: ${student.parentId}`);
        } catch (err) {
           console.warn(`Could not delete parent account ${student.parentId} - likely has other data linked`);
        }
      }
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete student' });
  }
};

export const getMyChildren = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    
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

    const studentsWithBalance = students.map(student => {
      const totalFees = student.feeStructures.reduce((sum, fee) => sum + Number(fee.amountDue), 0);
      const totalPaid = student.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const balance = totalFees - totalPaid;

      // We only want to send the last 5 payments to the frontend to keep payload small, 
      // but we needed all of them for calculation.
      const recentPayments = student.payments.slice(0, 5);

      return {
        ...student,
        payments: recentPayments,
        balance
      };
    });
    
    res.json(studentsWithBalance);
  } catch (error) {
    console.error('Get my children error:', error);
    res.status(500).json({ error: 'Failed to fetch children' });
  }
};
