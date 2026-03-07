"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPayslip = exports.markPayrollPaid = exports.approvePayrollRun = exports.getPayrollRunDetail = exports.createPayrollRun = exports.getPayrollRuns = exports.deleteStaffPayroll = exports.updateStaffPayroll = exports.createStaffPayroll = exports.getStaffPayrolls = void 0;
const prisma_1 = require("../utils/prisma");
const zod_1 = require("zod");
const accountingService_1 = require("../services/accountingService");
const accountingBridge_1 = require("../services/accountingBridge");
// ========================================
// STAFF PAYROLL MANAGEMENT
// ========================================
const staffPayrollSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
    basicSalary: zod_1.z.number().positive(),
    housingAllowance: zod_1.z.number().min(0).default(0),
    transportAllowance: zod_1.z.number().min(0).default(0),
    otherAllowances: zod_1.z.number().min(0).default(0),
    bankName: zod_1.z.string().optional(),
    bankAccount: zod_1.z.string().optional(),
    bankBranch: zod_1.z.string().optional(),
});
const getStaffPayrolls = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchFilter = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? {} : { branchId: user === null || user === void 0 ? void 0 : user.branchId };
        const payrolls = yield prisma_1.prisma.staffPayroll.findMany({
            where: Object.assign({ isActive: true }, branchFilter),
            orderBy: { createdAt: 'desc' },
        });
        // Enrich with user info
        const userIds = payrolls.map(p => p.userId);
        const users = yield prisma_1.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true, email: true, role: true },
        });
        const userMap = new Map(users.map(u => [u.id, u]));
        const enriched = payrolls.map(p => (Object.assign(Object.assign({}, p), { basicSalary: Number(p.basicSalary), housingAllowance: Number(p.housingAllowance), transportAllowance: Number(p.transportAllowance), otherAllowances: Number(p.otherAllowances), taxDeduction: Number(p.taxDeduction), napsaDeduction: Number(p.napsaDeduction), nhimaDeduction: Number(p.nhimaDeduction), otherDeductions: Number(p.otherDeductions), netSalary: Number(p.netSalary), user: userMap.get(p.userId) })));
        res.json(enriched);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch staff payrolls' });
    }
});
exports.getStaffPayrolls = getStaffPayrolls;
const createStaffPayroll = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = staffPayrollSchema.parse(req.body);
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        // Check if user exists
        const staffUser = yield prisma_1.prisma.user.findUnique({ where: { id: data.userId } });
        if (!staffUser)
            return res.status(404).json({ error: 'User not found' });
        // Check if payroll already exists
        const existing = yield prisma_1.prisma.staffPayroll.findUnique({ where: { userId: data.userId } });
        if (existing)
            return res.status(400).json({ error: 'Payroll record already exists for this user' });
        // Calculate gross
        const grossSalary = data.basicSalary + data.housingAllowance + data.transportAllowance + data.otherAllowances;
        // Auto-calculate Zambian deductions
        const paye = (0, accountingService_1.calculatePAYE)(grossSalary);
        const napsa = (0, accountingService_1.calculateNAPSA)(grossSalary);
        const nhima = (0, accountingService_1.calculateNHIMA)(grossSalary);
        const totalDeductions = paye + napsa.employee + nhima.employee;
        const netSalary = grossSalary - totalDeductions;
        const payroll = yield prisma_1.prisma.staffPayroll.create({
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
        res.status(201).json(Object.assign(Object.assign({}, payroll), { basicSalary: Number(payroll.basicSalary), netSalary: Number(payroll.netSalary), grossSalary,
            totalDeductions }));
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        console.error('Create payroll error:', error);
        res.status(500).json({ error: 'Failed to create staff payroll' });
    }
});
exports.createStaffPayroll = createStaffPayroll;
const updateStaffPayroll = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const data = staffPayrollSchema.partial().parse(req.body);
        const existing = yield prisma_1.prisma.staffPayroll.findUnique({ where: { id: req.params.id } });
        if (!existing)
            return res.status(404).json({ error: 'Payroll record not found' });
        const basicSalary = (_a = data.basicSalary) !== null && _a !== void 0 ? _a : Number(existing.basicSalary);
        const housingAllowance = (_b = data.housingAllowance) !== null && _b !== void 0 ? _b : Number(existing.housingAllowance);
        const transportAllowance = (_c = data.transportAllowance) !== null && _c !== void 0 ? _c : Number(existing.transportAllowance);
        const otherAllowances = (_d = data.otherAllowances) !== null && _d !== void 0 ? _d : Number(existing.otherAllowances);
        const grossSalary = basicSalary + housingAllowance + transportAllowance + otherAllowances;
        const paye = (0, accountingService_1.calculatePAYE)(grossSalary);
        const napsa = (0, accountingService_1.calculateNAPSA)(grossSalary);
        const nhima = (0, accountingService_1.calculateNHIMA)(grossSalary);
        const netSalary = grossSalary - paye - napsa.employee - nhima.employee;
        const payroll = yield prisma_1.prisma.staffPayroll.update({
            where: { id: req.params.id },
            data: Object.assign(Object.assign({}, data), { taxDeduction: paye, napsaDeduction: napsa.employee, nhimaDeduction: nhima.employee, netSalary }),
        });
        res.json(payroll);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: 'Failed to update payroll' });
    }
});
exports.updateStaffPayroll = updateStaffPayroll;
const deleteStaffPayroll = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma_1.prisma.staffPayroll.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });
        res.json({ message: 'Payroll record deactivated' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete payroll' });
    }
});
exports.deleteStaffPayroll = deleteStaffPayroll;
// ========================================
// PAYROLL RUNS
// ========================================
const getPayrollRuns = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchFilter = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? {} : { branchId: user === null || user === void 0 ? void 0 : user.branchId };
        const runs = yield prisma_1.prisma.payrollRun.findMany({
            where: branchFilter,
            include: { _count: { select: { payslips: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(runs.map(r => (Object.assign(Object.assign({}, r), { totalGross: Number(r.totalGross), totalDeductions: Number(r.totalDeductions), totalNet: Number(r.totalNet) }))));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch payroll runs' });
    }
});
exports.getPayrollRuns = getPayrollRuns;
const createPayrollRun = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { month, year, description } = zod_1.z.object({
            month: zod_1.z.number().int().min(1).max(12),
            year: zod_1.z.number().int().min(2020),
            description: zod_1.z.string().optional(),
        }).parse(req.body);
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const branchFilter = user.role === 'SUPER_ADMIN' ? {} : { branchId: user.branchId };
        // Check for existing run
        const existing = yield prisma_1.prisma.payrollRun.findFirst({
            where: Object.assign({ month, year }, branchFilter),
        });
        if (existing)
            return res.status(400).json({ error: `Payroll for ${month}/${year} already exists` });
        // Get all active staff payrolls
        const staffPayrolls = yield prisma_1.prisma.staffPayroll.findMany({
            where: Object.assign({ isActive: true }, branchFilter),
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
        const run = yield prisma_1.prisma.payrollRun.create({
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
        yield (0, accountingService_1.logFinancialAction)({
            userId: user.userId,
            action: 'PAYROLL_CREATED',
            entityType: 'PayrollRun',
            entityId: run.id,
            description: `Created payroll run ${runNumber} with ${payslipData.length} payslips`,
            amount: totalNet,
            branchId: user.branchId,
        });
        res.status(201).json(Object.assign(Object.assign({}, run), { totalGross: Number(run.totalGross), totalDeductions: Number(run.totalDeductions), totalNet: Number(run.totalNet) }));
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        console.error('Create payroll run error:', error);
        res.status(500).json({ error: 'Failed to create payroll run' });
    }
});
exports.createPayrollRun = createPayrollRun;
const getPayrollRunDetail = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const run = yield prisma_1.prisma.payrollRun.findUnique({
            where: { id: req.params.id },
            include: { payslips: true },
        });
        if (!run)
            return res.status(404).json({ error: 'Payroll run not found' });
        // Enrich payslips with user info
        const userIds = run.payslips.map(p => p.userId);
        const users = yield prisma_1.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true, email: true, role: true },
        });
        const userMap = new Map(users.map(u => [u.id, u]));
        res.json(Object.assign(Object.assign({}, run), { totalGross: Number(run.totalGross), totalDeductions: Number(run.totalDeductions), totalNet: Number(run.totalNet), payslips: run.payslips.map(p => (Object.assign(Object.assign({}, p), { basicSalary: Number(p.basicSalary), housingAllowance: Number(p.housingAllowance), transportAllowance: Number(p.transportAllowance), otherAllowances: Number(p.otherAllowances), grossSalary: Number(p.grossSalary), payeTax: Number(p.payeTax), napsaContribution: Number(p.napsaContribution), nhimaContribution: Number(p.nhimaContribution), otherDeductions: Number(p.otherDeductions), totalDeductions: Number(p.totalDeductions), netSalary: Number(p.netSalary), user: userMap.get(p.userId) }))) }));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch payroll run' });
    }
});
exports.getPayrollRunDetail = getPayrollRunDetail;
const approvePayrollRun = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const run = yield prisma_1.prisma.payrollRun.findUnique({ where: { id: req.params.id } });
        if (!run)
            return res.status(404).json({ error: 'Payroll run not found' });
        if (run.status !== 'DRAFT' && run.status !== 'PROCESSING') {
            return res.status(400).json({ error: 'Payroll run cannot be approved in current state' });
        }
        const updated = yield prisma_1.prisma.payrollRun.update({
            where: { id: req.params.id },
            data: { status: 'APPROVED', approvedBy: user.userId, approvedAt: new Date() },
        });
        yield (0, accountingService_1.logFinancialAction)({
            userId: user.userId,
            action: 'PAYROLL_APPROVED',
            entityType: 'PayrollRun',
            entityId: run.id,
            description: `Approved payroll run ${run.runNumber}`,
            amount: Number(run.totalNet),
            branchId: user.branchId,
        });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to approve payroll run' });
    }
});
exports.approvePayrollRun = approvePayrollRun;
const markPayrollPaid = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const run = yield prisma_1.prisma.payrollRun.findUnique({
            where: { id: req.params.id },
            include: { payslips: true },
        });
        if (!run)
            return res.status(404).json({ error: 'Payroll run not found' });
        if (run.status !== 'APPROVED')
            return res.status(400).json({ error: 'Payroll must be approved first' });
        // Mark all payslips as paid
        yield prisma_1.prisma.payslip.updateMany({
            where: { payrollRunId: run.id },
            data: { isPaid: true, paidAt: new Date() },
        });
        const updated = yield prisma_1.prisma.payrollRun.update({
            where: { id: req.params.id },
            data: { status: 'PAID', paidAt: new Date() },
        });
        yield (0, accountingService_1.logFinancialAction)({
            userId: user.userId,
            action: 'PAYROLL_PAID',
            entityType: 'PayrollRun',
            entityId: run.id,
            description: `Paid payroll run ${run.runNumber} (${run.payslips.length} staff)`,
            amount: Number(run.totalNet),
            branchId: user.branchId,
        });
        // Create accounting journal entries for payroll
        (0, accountingBridge_1.onPayrollCompleted)(run.id, user.userId).catch(err => console.error('Background payroll journal creation failed:', err));
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to mark payroll as paid' });
    }
});
exports.markPayrollPaid = markPayrollPaid;
const getPayslip = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const payslip = yield prisma_1.prisma.payslip.findUnique({
            where: { id: req.params.id },
            include: { payrollRun: true, staffPayroll: true },
        });
        if (!payslip)
            return res.status(404).json({ error: 'Payslip not found' });
        const staffUser = yield prisma_1.prisma.user.findUnique({
            where: { id: payslip.userId },
            select: { fullName: true, email: true, role: true },
        });
        res.json(Object.assign(Object.assign({}, payslip), { basicSalary: Number(payslip.basicSalary), housingAllowance: Number(payslip.housingAllowance), transportAllowance: Number(payslip.transportAllowance), otherAllowances: Number(payslip.otherAllowances), grossSalary: Number(payslip.grossSalary), payeTax: Number(payslip.payeTax), napsaContribution: Number(payslip.napsaContribution), nhimaContribution: Number(payslip.nhimaContribution), otherDeductions: Number(payslip.otherDeductions), totalDeductions: Number(payslip.totalDeductions), netSalary: Number(payslip.netSalary), user: staffUser }));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch payslip' });
    }
});
exports.getPayslip = getPayslip;
