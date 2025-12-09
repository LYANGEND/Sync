import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { sendEmail } from '../services/emailService';

const prisma = new PrismaClient();

const createPaymentSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT']),
  referenceNumber: z.string().optional(),
});

export const createPayment = async (req: Request, res: Response) => {
  try {
    const { studentId, amount, method, referenceNumber } = createPaymentSchema.parse(req.body);
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if student exists
    const student = await prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const payment = await prisma.payment.create({
      data: {
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

    // Send Email Notification
    const parentEmail = payment.student.parent?.email || payment.student.guardianEmail;
    const parentName = payment.student.parent?.fullName || payment.student.guardianName || 'Parent';

    if (parentEmail) {
      console.log(`DEBUG: Sending payment receipt to ${parentEmail}`);
      const emailSubject = `Payment Receipt - ${payment.student.firstName} ${payment.student.lastName}`;
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Payment Receipt</h2>
          <p>Dear ${parentName},</p>
          <p>We have successfully received a payment for <strong>${payment.student.firstName} ${payment.student.lastName}</strong>.</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Amount:</td>
                <td style="padding: 8px 0; font-weight: bold; text-align: right;">ZMW ${Number(amount).toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Date:</td>
                <td style="padding: 8px 0; font-weight: bold; text-align: right;">${new Date().toLocaleDateString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Method:</td>
                <td style="padding: 8px 0; font-weight: bold; text-align: right;">${method.replace('_', ' ')}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Reference:</td>
                <td style="padding: 8px 0; font-weight: bold; text-align: right;">${referenceNumber || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Recorded By:</td>
                <td style="padding: 8px 0; font-weight: bold; text-align: right;">${payment.recordedBy.fullName}</td>
              </tr>
            </table>
          </div>

          <p>You can view the full payment history in your parent portal.</p>
          <p>Thank you,<br>School Accounts Office</p>
        </div>
      `;

      sendEmail(parentEmail, emailSubject, emailBody).catch(err => 
        console.error('Failed to send payment receipt email:', err)
      );
    } else {
      console.log('DEBUG: No parent email found for payment receipt');
    }

    res.status(201).json(payment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Create payment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getPayments = async (req: Request, res: Response) => {
  try {
    const payments = await prisma.payment.findMany({
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
    console.error('Get payments error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getStudentPayments = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;

    const payments = await prisma.payment.findMany({
      where: { studentId },
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
    console.error('Get student payments error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getFinanceStats = async (req: Request, res: Response) => {
  try {
    // 1. Total Revenue (Sum of all payments)
    const totalRevenueAgg = await prisma.payment.aggregate({
      _sum: { amount: true },
      _count: { id: true },
    });
    const totalRevenue = Number(totalRevenueAgg._sum.amount || 0);
    const totalTransactions = totalRevenueAgg._count.id;

    // 2. Total Fees Assigned (Sum of all fee structures)
    const totalFeesAgg = await prisma.studentFeeStructure.aggregate({
      _sum: { amountDue: true },
    });
    const totalFeesAssigned = Number(totalFeesAgg._sum.amountDue || 0);

    // 3. Pending Fees
    const pendingFees = Math.max(0, totalFeesAssigned - totalRevenue);

    // 4. Overdue Students Count
    // Get total due per student
    const feesByStudent = await prisma.studentFeeStructure.groupBy({
      by: ['studentId'],
      _sum: { amountDue: true },
    });

    // Get total paid per student
    const paymentsByStudent = await prisma.payment.groupBy({
      by: ['studentId'],
      _sum: { amount: true },
    });

    // Create a map for quick lookup
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
    console.error('Get finance stats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
