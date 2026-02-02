import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { initiateMobileMoneyCollection } from '../services/lencoService';
import { sendNotification, generatePaymentReceiptEmail } from '../services/notificationService';

const prisma = new PrismaClient();

// Schema for searching student by admission number
const searchStudentSchema = z.object({
  admissionNumber: z.string().min(1, 'Admission number is required').max(50),
  tenantSlug: z.string().min(1, 'School identifier is required').max(50).regex(/^[a-z0-9-]+$/, 'Invalid school identifier'),
});

// Phone number regex for Zambian numbers (MTN: 096/076, Airtel: 097/077)
const zambianPhoneRegex = /^(260|0)?(9[67]|7[67])\d{7}$/;

// Schema for initiating a public payment
const publicPaymentSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().positive().max(1000000, 'Amount exceeds maximum allowed'),
  operator: z.enum(['mtn', 'airtel']),
  phoneNumber: z.string()
    .min(9, 'Phone number too short')
    .max(15, 'Phone number too long')
    .regex(zambianPhoneRegex, 'Invalid Zambian mobile number format'),
  payerName: z.string().max(100).optional(),
  payerPhone: z.string().max(15).optional(),
});

/**
 * Get school info by slug (for public payment page)
 */
export const getSchoolInfo = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        email: true,
        phone: true,
        address: true,
        primaryColor: true,
        status: true,
      },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'School not found' });
    }

    if (tenant.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'School payment portal is not available' });
    }

    res.json(tenant);
  } catch (error) {
    console.error('Error fetching school info:', error);
    res.status(500).json({ error: 'Failed to fetch school information' });
  }
};

/**
 * Search for a student by admission number (public)
 */
export const searchStudentPublic = async (req: Request, res: Response) => {
  try {
    const { admissionNumber, tenantSlug } = searchStudentSchema.parse(req.query);

    // Find tenant by slug
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant || tenant.status !== 'ACTIVE') {
      return res.status(404).json({ error: 'School not found or not active' });
    }

    // Find student
    const student = await prisma.student.findFirst({
      where: {
        admissionNumber: admissionNumber.toUpperCase(),
        tenantId: tenant.id,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        guardianName: true,
        guardianPhone: true,
        class: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Calculate balance
    const feeStructures = await prisma.studentFeeStructure.findMany({
      where: { studentId: student.id },
      select: { amountDue: true },
    });

    const payments = await prisma.payment.findMany({
      where: { 
        studentId: student.id,
        status: 'COMPLETED',
      },
      select: { amount: true },
    });

    const totalFees = feeStructures.reduce((sum: number, f: { amountDue: any }) => sum + Number(f.amountDue), 0);
    const totalPaid = payments.reduce((sum: number, p: { amount: any }) => sum + Number(p.amount), 0);
    const balance = totalFees - totalPaid;

    res.json({
      student: {
        ...student,
        balance: Math.max(0, balance),
        totalFees,
        totalPaid,
      },
      school: {
        name: tenant.name,
        slug: tenant.slug,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Error searching student:', error);
    res.status(500).json({ error: 'Failed to search for student' });
  }
};

/**
 * Initiate a public mobile money payment
 */
export const initiatePublicPayment = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { studentId, amount, operator, phoneNumber, payerName, payerPhone } = publicPaymentSchema.parse(req.body);

    // Find tenant by slug
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
    });

    if (!tenant || tenant.status !== 'ACTIVE') {
      return res.status(404).json({ error: 'School not found or not active' });
    }

    // Find student
    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        tenantId: tenant.id,
      },
      include: {
        class: true,
        branchEnrollments: {
          where: { isPrimary: true },
          take: 1,
        },
      },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Generate transaction ID
    const transactionId = 'PUB-' + Math.random().toString(36).substring(2, 9).toUpperCase();

    // Get platform settings for fee configuration
    const platformSettings = await prisma.platformSettings.findUnique({
      where: { id: 'default' }
    });
    
    // Calculate fee (use configured fee or default 2.5%)
    const feePercent = platformSettings?.mobileMoneyFeePercent 
      ? Number(platformSettings.mobileMoneyFeePercent) 
      : 0.025;
    
    let mobileMoneyFee = amount * feePercent;
    
    // Apply fee cap if configured
    if (platformSettings?.mobileMoneyFeeCap) {
      const feeCap = Number(platformSettings.mobileMoneyFeeCap);
      mobileMoneyFee = Math.min(mobileMoneyFee, feeCap);
    }
    
    const finalAmount = amount + mobileMoneyFee;

    // Determine branch
    let branchId = student.branchEnrollments?.[0]?.branchId || student.branchId || null;

    // Find or create a system user for recording public payments
    let systemUser = await prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        email: `system@${tenant.slug}.sync`,
      },
    });

    if (!systemUser) {
      // Use the first admin user as recorder
      systemUser = await prisma.user.findFirst({
        where: {
          tenantId: tenant.id,
          role: 'SUPER_ADMIN',
        },
      });
    }

    if (!systemUser) {
      return res.status(500).json({ error: 'No system user configured for payments' });
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        studentId,
        branchId,
        amount: finalAmount,
        method: 'MOBILE_MONEY',
        transactionId,
        notes: payerName ? `Public payment by ${payerName} (${payerPhone || phoneNumber})` : 'Public online payment',
        recordedByUserId: systemUser.id,
        // @ts-ignore
        status: 'PENDING',
        mobileMoneyOperator: operator,
        mobileMoneyPhone: phoneNumber,
        mobileMoneyFee,
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
            class: {
              select: { name: true },
            },
          },
        },
      },
    });

    // Initiate mobile money collection
    try {
      const gatewayResponse = await initiateMobileMoneyCollection(
        finalAmount,
        phoneNumber,
        transactionId,
        operator
      );

      // Update payment with gateway reference
      if (gatewayResponse.reference) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { mobileMoneyRef: gatewayResponse.reference },
        });
      }

      res.status(202).json({
        message: 'Payment initiated. Please check your phone to authorize the payment.',
        payment: {
          id: payment.id,
          transactionId,
          amount: finalAmount,
          fee: mobileMoneyFee,
          originalAmount: amount,
          status: 'PENDING',
          operator,
          phone: phoneNumber,
        },
        gateway: gatewayResponse,
      });
    } catch (err: any) {
      console.error('Mobile money initiation failed:', err);
      
      // Mark payment as failed
      await prisma.payment.update({
        where: { id: payment.id },
        // @ts-ignore
        data: { status: 'FAILED', mobileMoneyStatus: 'FAILED' },
      });

      return res.status(400).json({
        error: 'Failed to initiate payment',
        message: err.message,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Error initiating public payment:', error);
    res.status(500).json({ error: 'Failed to initiate payment' });
  }
};

/**
 * Check payment status (public)
 */
export const checkPaymentStatus = async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;

    const payment = await prisma.payment.findFirst({
      where: { transactionId },
      select: {
        id: true,
        amount: true,
        status: true,
        transactionId: true,
        mobileMoneyStatus: true,
        mobileMoneyRef: true,
        mobileMoneyConfirmedAt: true,
        paymentDate: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNumber: true,
          },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
};
