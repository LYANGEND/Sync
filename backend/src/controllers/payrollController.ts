import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  generateSequenceNumber,
  logFinancialAction,
  calculatePAYE,
  calculateNAPSA,
  calculateNHIMA,
} from '../services/accountingService';
import { onPayrollCompleted } from '../services/accountingBridge';

// ========================================
// STAFF PAYROLL MANAGEMENT
// ========================================

const staffPayrollSchema = z.object({
  userId: z.string().uuid(),
  basicSalary: z.number().positive(),
  housingAllowance: z.number().min(0).default(0),
  transportAllowance: z.number().min(0).default(0),
  otherAllowances: z.number().min(0).default(0),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  bankBranch: z.string().optional(),
});

export const getStaffPayrolls = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchFilter = user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId };

    const payrolls = await prisma.staffPayroll.findMany({
      where: { isActive: true, ...branchFilter },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with user info
    const userIds = payrolls.map(p => p.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, email: true, role: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    const enriched = payrolls.map(p => ({
      ...p,
      basicSalary: Number(p.basicSalary),
      housingAllowance: Number(p.housingAllowance),
      transportAllowance: Number(p.transportAllowance),
      otherAllowances: Number(p.otherAllowances),
      taxDeduction: Number(p.taxDeduction),
      napsaDeduction: Number(p.napsaDeduction),
      nhimaDeduction: Number(p.nhimaDeduction),
      otherDeductions: Number(p.otherDeductions),
      netSalary: Number(p.netSalary),
      user: userMap.get(p.userId),
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch staff payrolls' });
  }
};

export const createStaffPayroll = async (req: Request, res: Response) => {
  try {
    const data = staffPayrollSchema.parse(req.body);
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Check if user exists
    const staffUser = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!staffUser) return res.status(404).json({ error: 'User not found' });

    // Check if payroll already exists
    const existing = await prisma.staffPayroll.findUnique({ where: { userId: data.userId } });
    if (existing) return res.status(400).json({ error: 'Payroll record already exists for this user' });

    // Calculate gross
    const grossSalary = data.basicSalary + data.housingAllowance + data.transportAllowance + data.otherAllowances;

    // Auto-calculate Zambian deductions
    const paye = calculatePAYE(grossSalary);
    const napsa = calculateNAPSA(grossSalary);
    const nhima = calculateNHIMA(grossSalary);

    const totalDeductions = paye + napsa.employee + nhima.employee;
    const netSalary = grossSalary - totalDeductions;

    const payroll = await prisma.staffPayroll.create({
      data: {
        userId: data.userId,
        basicSalary: data.basicSalary,
        housingAllowance: data.housingAllowance,
        transportAllowance: data.transportAllowance,
        otherAllowances: data.otherAllowances,
        taxDeduction: paye,
        napsaDeduction: napsa.employee,
        nhimaDeduction: nhima.employee,
        netSalary,
        bankName: data.bankName,
        bankAccount: data.bankAccount,
        bankBranch: data.bankBranch,
        branchId: user.branchId || staffUser.branchId,
      },
    });

    res.status(201).json({
      ...payroll,
      basicSalary: Number(payroll.basicSalary),
      netSalary: Number(payroll.netSalary),
      grossSalary,
      totalDeductions,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error('Create payroll error:', error);
    res.status(500).json({ error: 'Failed to create staff payroll' });
  }
};

export const updateStaffPayroll = async (req: Request, res: Response) => {
  try {
    const data = staffPayrollSchema.partial().parse(req.body);
    const existing = await prisma.staffPayroll.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Payroll record not found' });

    const basicSalary = data.basicSalary ?? Number(existing.basicSalary);
    const housingAllowance = data.housingAllowance ?? Number(existing.housingAllowance);
    const transportAllowance = data.transportAllowance ?? Number(existing.transportAllowance);
    const otherAllowances = data.otherAllowances ?? Number(existing.otherAllowances);

    const grossSalary = basicSalary + housingAllowance + transportAllowance + otherAllowances;
    const paye = calculatePAYE(grossSalary);
    const napsa = calculateNAPSA(grossSalary);
    const nhima = calculateNHIMA(grossSalary);
    const netSalary = grossSalary - paye - napsa.employee - nhima.employee;

    const payroll = await prisma.staffPayroll.update({
      where: { id: req.params.id },
      data: {
        ...data,
        taxDeduction: paye,
        napsaDeduction: napsa.employee,
        nhimaDeduction: nhima.employee,
        netSalary,
      },
    });

    res.json(payroll);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: 'Failed to update payroll' });
  }
};

export const deleteStaffPayroll = async (req: Request, res: Response) => {
  try {
    await prisma.staffPayroll.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ message: 'Payroll record deactivated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete payroll' });
  }
};

// ========================================
// PAYROLL RUNS
// ========================================

export const getPayrollRuns = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchFilter = user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId };

    const runs = await prisma.payrollRun.findMany({
      where: branchFilter,
      include: { _count: { select: { payslips: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(runs.map(r => ({
      ...r,
      totalGross: Number(r.totalGross),
      totalDeductions: Number(r.totalDeductions),
      totalNet: Number(r.totalNet),
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payroll runs' });
  }
};

export const createPayrollRun = async (req: Request, res: Response) => {
  try {
    const { month, year, description } = z.object({
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2020),
      description: z.string().optional(),
    }).parse(req.body);
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const branchFilter = user.role === 'SUPER_ADMIN' ? {} : { branchId: user.branchId };

    // Check for existing run
    const existing = await prisma.payrollRun.findFirst({
      where: { month, year, ...branchFilter },
    });
    if (existing) return res.status(400).json({ error: `Payroll for ${month}/${year} already exists` });

    // Get all active staff payrolls
    const staffPayrolls = await prisma.staffPayroll.findMany({
      where: { isActive: true, ...branchFilter },
    });

    if (staffPayrolls.length === 0) {
      return res.status(400).json({ error: 'No active staff payroll records found' });
    }

    const runNumber = `PAY-${year}-${String(month).padStart(2, '0')}`;
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    const payslipData = staffPayrolls.map((sp, index) => {
      const gross = Number(sp.basicSalary) + Number(sp.housingAllowance) + Number(sp.transportAllowance) + Number(sp.otherAllowances);
      const deductions = Number(sp.taxDeduction) + Number(sp.napsaDeduction) + Number(sp.nhimaDeduction) + Number(sp.otherDeductions);
      const net = gross - deductions;

      totalGross += gross;
      totalDeductions += deductions;
      totalNet += net;

      return {
        payslipNumber: `PS-${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(5, '0')}`,
        staffPayrollId: sp.id,
        userId: sp.userId,
        basicSalary: Number(sp.basicSalary),
        housingAllowance: Number(sp.housingAllowance),
        transportAllowance: Number(sp.transportAllowance),
        otherAllowances: Number(sp.otherAllowances),
        grossSalary: gross,
        payeTax: Number(sp.taxDeduction),
        napsaContribution: Number(sp.napsaDeduction),
        nhimaContribution: Number(sp.nhimaDeduction),
        otherDeductions: Number(sp.otherDeductions),
        totalDeductions: deductions,
        netSalary: net,
      };
    });

    const run = await prisma.payrollRun.create({
      data: {
        runNumber,
        month,
        year,
        description,
        totalGross,
        totalDeductions,
        totalNet,
        preparedBy: user.userId,
        branchId: user.branchId,
        payslips: { create: payslipData },
      },
      include: { payslips: true },
    });

    await logFinancialAction({
      userId: user.userId,
      action: 'PAYROLL_CREATED',
      entityType: 'PayrollRun',
      entityId: run.id,
      description: `Created payroll run ${runNumber} with ${payslipData.length} payslips`,
      amount: totalNet,
      branchId: user.branchId,
    });

    res.status(201).json({
      ...run,
      totalGross: Number(run.totalGross),
      totalDeductions: Number(run.totalDeductions),
      totalNet: Number(run.totalNet),
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error('Create payroll run error:', error);
    res.status(500).json({ error: 'Failed to create payroll run' });
  }
};

export const getPayrollRunDetail = async (req: Request, res: Response) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.id },
      include: { payslips: true },
    });
    if (!run) return res.status(404).json({ error: 'Payroll run not found' });

    // Enrich payslips with user info
    const userIds = run.payslips.map(p => p.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, email: true, role: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    res.json({
      ...run,
      totalGross: Number(run.totalGross),
      totalDeductions: Number(run.totalDeductions),
      totalNet: Number(run.totalNet),
      payslips: run.payslips.map(p => ({
        ...p,
        basicSalary: Number(p.basicSalary),
        housingAllowance: Number(p.housingAllowance),
        transportAllowance: Number(p.transportAllowance),
        otherAllowances: Number(p.otherAllowances),
        grossSalary: Number(p.grossSalary),
        payeTax: Number(p.payeTax),
        napsaContribution: Number(p.napsaContribution),
        nhimaContribution: Number(p.nhimaContribution),
        otherDeductions: Number(p.otherDeductions),
        totalDeductions: Number(p.totalDeductions),
        netSalary: Number(p.netSalary),
        user: userMap.get(p.userId),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payroll run' });
  }
};

export const approvePayrollRun = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
    if (!run) return res.status(404).json({ error: 'Payroll run not found' });
    if (run.status !== 'DRAFT' && run.status !== 'PROCESSING') {
      return res.status(400).json({ error: 'Payroll run cannot be approved in current state' });
    }

    const updated = await prisma.payrollRun.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', approvedBy: user.userId, approvedAt: new Date() },
    });

    await logFinancialAction({
      userId: user.userId,
      action: 'PAYROLL_APPROVED',
      entityType: 'PayrollRun',
      entityId: run.id,
      description: `Approved payroll run ${run.runNumber}`,
      amount: Number(run.totalNet),
      branchId: user.branchId,
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve payroll run' });
  }
};

export const markPayrollPaid = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.id },
      include: { payslips: true },
    });
    if (!run) return res.status(404).json({ error: 'Payroll run not found' });
    if (run.status !== 'APPROVED') return res.status(400).json({ error: 'Payroll must be approved first' });

    // Mark all payslips as paid
    await prisma.payslip.updateMany({
      where: { payrollRunId: run.id },
      data: { isPaid: true, paidAt: new Date() },
    });

    const updated = await prisma.payrollRun.update({
      where: { id: req.params.id },
      data: { status: 'PAID', paidAt: new Date() },
    });

    await logFinancialAction({
      userId: user.userId,
      action: 'PAYROLL_PAID',
      entityType: 'PayrollRun',
      entityId: run.id,
      description: `Paid payroll run ${run.runNumber} (${run.payslips.length} staff)`,
      amount: Number(run.totalNet),
      branchId: user.branchId,
    });

    // Create accounting journal entries for payroll
    onPayrollCompleted(run.id, user.userId).catch(err =>
      console.error('Background payroll journal creation failed:', err)
    );

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark payroll as paid' });
  }
};

export const getPayslip = async (req: Request, res: Response) => {
  try {
    const payslip = await prisma.payslip.findUnique({
      where: { id: req.params.id },
      include: { payrollRun: true, staffPayroll: true },
    });
    if (!payslip) return res.status(404).json({ error: 'Payslip not found' });

    const staffUser = await prisma.user.findUnique({
      where: { id: payslip.userId },
      select: { fullName: true, email: true, role: true },
    });

    res.json({
      ...payslip,
      basicSalary: Number(payslip.basicSalary),
      housingAllowance: Number(payslip.housingAllowance),
      transportAllowance: Number(payslip.transportAllowance),
      otherAllowances: Number(payslip.otherAllowances),
      grossSalary: Number(payslip.grossSalary),
      payeTax: Number(payslip.payeTax),
      napsaContribution: Number(payslip.napsaContribution),
      nhimaContribution: Number(payslip.nhimaContribution),
      otherDeductions: Number(payslip.otherDeductions),
      totalDeductions: Number(payslip.totalDeductions),
      netSalary: Number(payslip.netSalary),
      user: staffUser,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payslip' });
  }
};
