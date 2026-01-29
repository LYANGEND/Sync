import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, getUserId, getUserRole, handleControllerError } from '../utils/tenantContext';
import { sendNotification, generatePaymentReceiptEmail } from '../services/notificationService';
import { initiateMobileMoneyCollection } from '../services/lencoService';

const prisma = new PrismaClient();

const createPaymentSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT']),
  transactionId: z.string().optional(),
  notes: z.string().optional(),
  operator: z.enum(['mtn', 'airtel']).optional(),
  phoneNumber: z.string().optional(),
  branchId: z.string().uuid().optional(),
});

export const createPayment = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const userRole = getUserRole(req);
    console.log(`DEBUG: createPayment called by user ${userId} (${userRole}) for tenant ${tenantId}`);
    console.log('DEBUG: Request Body:', JSON.stringify(req.body, null, 2));

    const { studentId, amount, method, notes, transactionId: providedTxnId, operator, phoneNumber, branchId: providedBranchId } = createPaymentSchema.parse(req.body);

    // Check if student exists in this tenant
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      include: {
        branchEnrollments: {
          where: { isPrimary: true },
          take: 1
        }
      }
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Determine Branch ID
    let finalBranchId = providedBranchId;
    if (!finalBranchId) {
      // 1. Try to use staff's active branch if they are recording it
      if (req.user?.branchId) {
        finalBranchId = req.user.branchId;
      }
      // 2. Fallback to student's primary branch
      else if (student.branchEnrollments && student.branchEnrollments.length > 0) {
        finalBranchId = student.branchEnrollments[0].branchId;
      }
      // 3. Fallback to student.branchId (direct link if exists)
      else if (student.branchId) {
        finalBranchId = student.branchId;
      }
    }

    // Security Check: Parents can only pay for their own children
    if (userRole === 'PARENT') {
      if (student.parentId !== userId) {
        // Fallback: Check if they are the guardian by email (if parentId not set yet)
        const parentUser = await prisma.user.findUnique({ where: { id: userId } });
        const userEmail = parentUser?.email;

        // Strict Check: Either ID matches, or (if no ID link) Email matches guardianEmail
        const isGuardian = userEmail && (student.guardianEmail === userEmail);

        if (!isGuardian && student.parentId !== userId) {
          return res.status(403).json({ message: 'Unauthorized: You can only make payments for your own children.' });
        }
      }
    }

    const transactionId = providedTxnId || 'TXN-' + Math.random().toString(36).substring(2, 9).toUpperCase();

    // Mobile Money Validation
    if (method === 'MOBILE_MONEY' && !operator) {
      return res.status(400).json({ message: 'Operator (mtn or airtel) is required for mobile money' });
    }

    // Calculate Fees if Mobile Money
    let finalAmount = amount;
    let finalNotes = notes || '';

    if (method === 'MOBILE_MONEY') {
      const fee = amount * 0.025; // 2.5% fee
      finalAmount = amount + fee;
      // We are silently adding the fee to the total, as requested
    }

    // @ts-ignore
    const initialStatus = method === 'MOBILE_MONEY' ? 'PENDING' : 'COMPLETED';

    const payment = await prisma.payment.create({
      data: {
        tenantId,
        studentId,
        branchId: finalBranchId,
        amount: finalAmount,
        method,
        notes: finalNotes,
        transactionId,
        recordedByUserId: userId,
        // @ts-ignore
        status: initialStatus
      },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNumber: true,
            guardianEmail: true,
            guardianName: true,
            guardianPhone: true,
            parent: {
              select: {
                email: true,
                fullName: true
              }
            },
            class: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        recordedBy: {
          select: {
            fullName: true,
          },
        },
      },
    });

    // Handle Mobile Money Initiation
    if (method === 'MOBILE_MONEY') {
      try {
        const targetPhone = phoneNumber || payment.student.guardianPhone;
        if (!targetPhone) {
          throw new Error('No phone number available for mobile money payment');
        }

        const gatewayResponse = await initiateMobileMoneyCollection(finalAmount, targetPhone, transactionId, operator!);

        return res.status(202).json({
          message: 'Payment initiated. Please check phone to authorize.',
          payment,
          gateway: gatewayResponse
        });
      } catch (err: any) {
        console.error('DEBUG: Mobile Money Initiation Failed:', err);
        // Mark as failed
        await prisma.payment.update({
          where: { id: payment.id },
          // @ts-ignore
          data: { status: 'FAILED' }
        });
        return res.status(400).json({ message: 'Payment initiation failed', error: err.message });
      }
    }

    // Send Notification (Email & SMS) via Notification Service
    try {
      // Fetch tenant settings for the name
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      const schoolName = tenant?.name || 'School';

      const parentEmail = payment.student.parent?.email || payment.student.guardianEmail;
      const parentPhone = payment.student.guardianPhone;
      const guardianName = payment.student.parent?.fullName || payment.student.guardianName || 'Parent';

      if (parentEmail || parentPhone) {
        const { subject, text, html, sms } = generatePaymentReceiptEmail(
          guardianName,
          `${payment.student.firstName} ${payment.student.lastName}`,
          Number(amount),
          new Date(),
          method,
          transactionId,
          schoolName
        );

        // Send via service handling both channels based on settings
        sendNotification(
          tenantId,
          parentEmail || undefined,
          parentPhone || undefined,
          subject,
          text,
          html,
          sms
        ).catch(err => console.error('Background notification failed:', err));

        console.log(`Notification queued for parent of student ${studentId}`);
      }
    } catch (notifyError) {
      console.error('Failed to process notifications:', notifyError);
      // Don't block the response, just log the error
    }

    res.status(201).json(payment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('DEBUG: Zod Validation Failed (createPayment):', JSON.stringify(error.errors, null, 2));
      return res.status(400).json({ errors: error.errors });
    }
    handleControllerError(res, error, 'createPayment');
  }
};

export const sendPaymentReceipt = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id, tenantId },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            guardianEmail: true,
            guardianName: true,
            guardianPhone: true,
            parent: {
              select: {
                email: true,
                fullName: true
              }
            }
          }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const schoolName = tenant?.name || 'School';

    // Parse request body for preferences
    const { email: providedEmail, phone: providedPhone, sendEmail = true, sendSms = true } = req.body;

    // Resolve Email
    let targetEmail: string | undefined;
    if (sendEmail) {
      if (providedEmail && providedEmail.trim() !== '') {
        targetEmail = providedEmail;
      } else {
        targetEmail = payment.student.parent?.email || payment.student.guardianEmail || undefined;
      }
    }

    // Resolve Phone
    let targetPhone: string | undefined;
    if (sendSms) {
      if (providedPhone && providedPhone.trim() !== '') {
        targetPhone = providedPhone;
      } else {
        targetPhone = payment.student.guardianPhone || undefined;
      }
    }

    const guardianName = payment.student.parent?.fullName || payment.student.guardianName || 'Parent';

    if (!targetEmail && !targetPhone) {
      return res.status(400).json({ message: 'No notification method selected or no contact details available' });
    }

    const { subject, text, html, sms } = generatePaymentReceiptEmail(
      guardianName,
      `${payment.student.firstName} ${payment.student.lastName}`,
      Number(payment.amount),
      new Date(payment.paymentDate),
      payment.method,
      payment.transactionId || 'N/A',
      schoolName
    );

    const result = await sendNotification(
      tenantId,
      targetEmail,
      targetPhone,
      subject,
      text,
      html,
      sms
    );

    res.json({ message: 'Receipt sent successfully', result });
  } catch (error) {
    handleControllerError(res, error, 'sendPaymentReceipt');
  }
};

export const voidPayment = async (req: TenantRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = getUserId(req);

    if (!reason) {
      return res.status(400).json({ message: 'Void reason is required' });
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // @ts-ignore - PaymentStatus enum might not be fully generated in types yet
    if (payment.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Payment is already voided' });
    }

    const updatedPayment = await prisma.payment.update({
      where: { id },
      data: {
        // @ts-ignore
        status: 'CANCELLED',
        voidReason: reason,
        voidedAt: new Date(),
        voidedByUserId: userId
      },
      include: {
        voidedBy: {
          select: { fullName: true }
        }
      }
    });

    res.json(updatedPayment);
  } catch (error) {
    handleControllerError(res, error, 'voidPayment');
  }
};

export const getPayments = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const branchId = req.query.branchId as string;

    const where: any = { tenantId };

    if (search && typeof search === 'string') {
      where.OR = [
        { student: { firstName: { contains: search, mode: 'insensitive' } } },
        { student: { lastName: { contains: search, mode: 'insensitive' } } },
        { student: { admissionNumber: { contains: search, mode: 'insensitive' } } },
        { transactionId: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Branch filter
    if (branchId && branchId !== 'ALL') {
      where.branchId = branchId;
    }

    const [payments, total] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              admissionNumber: true,
              guardianEmail: true,
              guardianPhone: true,
              parent: {
                select: {
                  email: true,
                  fullName: true
                }
              },
              class: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          recordedBy: {
            select: {
              fullName: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              code: true
            }
          }
        },
        orderBy: {
          paymentDate: 'desc'
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.payment.count({ where })
    ]);

    res.json({
      data: payments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('DEBUG: Zod Validation Failed:', JSON.stringify(error.errors, null, 2));
      return res.status(400).json({
        message: 'Validation Error',
        errors: error.errors
      });
    }
    console.error('DEBUG: getPayments Error:', error);
    handleControllerError(res, error, 'getPayments');
  }
};

export const getStudentPayments = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { studentId } = req.params;

    // Verify student belongs to this tenant
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId }
    });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const payments = await prisma.payment.findMany({
      where: { tenantId, studentId },
      include: {
        recordedBy: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(payments);
  } catch (error) {
    handleControllerError(res, error, 'getStudentPayments');
  }
};

export const getFinanceStats = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    // 1. Total Revenue (Sum of all payments for this tenant)
    const totalRevenueAgg = await prisma.payment.aggregate({
      where: {
        tenantId,
        // @ts-ignore
        status: 'COMPLETED'
      },
      _sum: { amount: true },
      _count: { id: true },
    });
    const totalRevenue = Number(totalRevenueAgg._sum.amount || 0);
    const totalTransactions = totalRevenueAgg._count.id;

    // 2. Get student IDs for this tenant
    const students = await prisma.student.findMany({
      where: { tenantId },
      select: { id: true }
    });
    const studentIds = students.map(s => s.id);

    // 2. Total Fees Assigned (Sum of all fee structures for tenant's students)
    const totalFeesAgg = await prisma.studentFeeStructure.aggregate({
      where: { studentId: { in: studentIds } },
      _sum: { amountDue: true },
    });
    const totalFeesAssigned = Number(totalFeesAgg._sum.amountDue || 0);

    // 3. Pending Fees
    const pendingFees = Math.max(0, totalFeesAssigned - totalRevenue);

    // 4. Overdue Students Count
    const feesByStudent = await prisma.studentFeeStructure.groupBy({
      by: ['studentId'],
      where: { studentId: { in: studentIds } },
      _sum: { amountDue: true },
    });

    const paymentsByStudent = await prisma.payment.groupBy({
      by: ['studentId'],
      where: {
        tenantId,
        // @ts-ignore
        status: 'COMPLETED'
      },
      _sum: { amount: true },
    });

    const paymentsMap = new Map<string, number>();
    paymentsByStudent.forEach(p => {
      paymentsMap.set(p.studentId, Number(p._sum.amount || 0));
    });

    let overdueCount = 0;
    feesByStudent.forEach(f => {
      const studentId = f.studentId;
      const due = Number(f._sum.amountDue || 0);
      const paid = paymentsMap.get(studentId) || 0;

      if (due > paid) {
        overdueCount++;
      }
    });

    res.json({
      totalRevenue,
      totalTransactions,
      pendingFees,
      overdueStudentsCount: overdueCount
    });

  } catch (error) {
    handleControllerError(res, error, 'getFinanceStats');
  }
};

export const getFinancialReport = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const endOfYear = new Date(today.getFullYear(), 11, 31);

    // 1. Monthly Revenue (Current Year)
    const monthlyPayments = await prisma.payment.groupBy({
      by: ['paymentDate'],
      where: {
        tenantId,
        // @ts-ignore
        status: 'COMPLETED',
        paymentDate: {
          gte: startOfYear,
          lte: endOfYear
        }
      },
      _sum: { amount: true },
    });

    // Process into months array [Jan, Feb, ...]
    const monthlyRevenue = Array(12).fill(0);
    monthlyPayments.forEach(p => {
      const month = new Date(p.paymentDate).getMonth();
      monthlyRevenue[month] += Number(p._sum.amount || 0);
    });

    // 2. Payment Methods Distribution
    const methodsStats = await prisma.payment.groupBy({
      by: ['method'],
      where: {
        tenantId,
        // @ts-ignore
        status: 'COMPLETED'
      },
      _count: { id: true },
      _sum: { amount: true }
    });

    // 3. Collection by Class
    const classes = await prisma.class.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        students: {
          select: {
            feeStructures: {
              select: { amountDue: true }
            },
            payments: {
              where: {
                // @ts-ignore
                status: 'COMPLETED'
              },
              select: { amount: true }
            }
          }
        }
      }
    });

    const classCollection = classes.map(cls => {
      let totalDue = 0;
      let totalCollected = 0;

      cls.students.forEach(student => {
        student.feeStructures.forEach(fee => totalDue += Number(fee.amountDue));
        student.payments.forEach(pay => totalCollected += Number(pay.amount));
      });

      return {
        className: cls.name,
        totalDue,
        totalCollected,
        percentage: totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0
      };
    }).sort((a, b) => b.percentage - a.percentage); // Best performing first

    res.json({
      monthlyRevenue,
      paymentMethods: methodsStats.map(m => ({
        method: m.method,
        count: m._count.id,
        amount: Number(m._sum.amount || 0)
      })),
      classCollection
    });

  } catch (error) {
    handleControllerError(res, error, 'getFinancialReport');
  }
};
