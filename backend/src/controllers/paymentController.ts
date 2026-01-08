import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, getUserId, handleControllerError } from '../utils/tenantContext';
import { sendNotification, generatePaymentReceiptEmail } from '../services/notificationService';

const prisma = new PrismaClient();

const createPaymentSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT']),
  referenceNumber: z.string().optional(),
});

export const createPayment = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { studentId, amount, method, referenceNumber } = createPaymentSchema.parse(req.body);

    // Check if student exists in this tenant
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const payment = await prisma.payment.create({
      data: {
        tenantId,
        studentId,
        amount,
        method,
        referenceNumber,
        recordedByUserId: userId,
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
          referenceNumber || 'N/A',
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
      return res.status(400).json({ errors: error.errors });
    }
    handleControllerError(res, error, 'createPayment');
  }
};

export const getPayments = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const payments = await prisma.payment.findMany({
      where: { tenantId },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNumber: true,
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(payments);
  } catch (error) {
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
      where: { tenantId },
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
      where: { tenantId },
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
      where: { tenantId },
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
