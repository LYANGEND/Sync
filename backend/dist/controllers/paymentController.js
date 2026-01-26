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
exports.initiatePublicMobileMoneyPayment = exports.getStudentForPublicPayment = exports.getMobileMoneyCollectionById = exports.getMobileMoneyCollections = exports.handleLencoWebhook = exports.checkMobileMoneyStatus = exports.initiateMobileMoneyPayment = exports.checkDuplicatePayment = exports.getPaymentById = exports.voidPayment = exports.getFinancialReport = exports.getFinanceStats = exports.getStudentPayments = exports.getPayments = exports.createPayment = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const notificationService_1 = require("../services/notificationService");
const lencoService_1 = require("../services/lencoService");
const prisma = new client_1.PrismaClient();
const createPaymentSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid(),
    amount: zod_1.z.number().positive(),
    method: zod_1.z.enum(['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT']),
    notes: zod_1.z.string().optional(),
});
// Generate unique transaction ID: TXN-XXXXXXXX (8 char UUID)
const generateTransactionId = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'TXN-';
    for (let i = 0; i < 8; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};
const createPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const parseResult = createPaymentSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }
        const { studentId, amount, method, notes } = parseResult.data;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        // Check if student exists
        const student = yield prisma.student.findUnique({
            where: { id: studentId },
        });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        // Check for potential duplicate payments (same student, same amount within 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentDuplicate = yield prisma.payment.findFirst({
            where: {
                studentId,
                amount,
                status: 'COMPLETED',
                createdAt: {
                    gte: fiveMinutesAgo
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        // If duplicate found and force flag not set, return warning
        if (recentDuplicate && !req.body.forceCreate) {
            return res.status(409).json({
                warning: 'POTENTIAL_DUPLICATE',
                message: `A similar payment of ZMW ${amount} for this student was recorded ${Math.round((Date.now() - recentDuplicate.createdAt.getTime()) / 1000 / 60)} minutes ago. Set forceCreate=true to proceed anyway.`,
                existingPayment: {
                    id: recentDuplicate.id,
                    transactionId: recentDuplicate.transactionId,
                    amount: Number(recentDuplicate.amount),
                    paymentDate: recentDuplicate.paymentDate,
                    method: recentDuplicate.method
                }
            });
        }
        // Generate transaction ID
        const transactionId = generateTransactionId();
        // Link payment to the branch of the student
        const branchId = student.branchId;
        const payment = yield prisma.payment.create({
            data: {
                transactionId,
                studentId,
                amount,
                method,
                notes,
                recordedByUserId: userId,
                branchId, // Assign branch
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
            // Fetch school settings for the name
            const settings = yield prisma.schoolSettings.findFirst();
            const schoolName = (settings === null || settings === void 0 ? void 0 : settings.schoolName) || 'School';
            const parentEmail = ((_b = payment.student.parent) === null || _b === void 0 ? void 0 : _b.email) || payment.student.guardianEmail;
            const parentPhone = payment.student.guardianPhone;
            const guardianName = ((_c = payment.student.parent) === null || _c === void 0 ? void 0 : _c.fullName) || payment.student.guardianName || 'Parent';
            if (parentEmail || parentPhone) {
                const { subject, text, html, sms } = (0, notificationService_1.generatePaymentReceiptEmail)(guardianName, `${payment.student.firstName} ${payment.student.lastName}`, Number(amount), new Date(), method, transactionId, schoolName);
                // Send via service handling both channels based on settings
                (0, notificationService_1.sendNotification)(parentEmail || undefined, parentPhone || undefined, subject, text, html, sms).catch(err => console.error('Background notification failed:', err));
                console.log(`Notification queued for parent of student ${studentId}`);
            }
        }
        catch (notifyError) {
            console.error('Failed to process notifications:', notifyError);
            // Don't block the response, just log the error
        }
        res.status(201).json(payment);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        console.error('Create payment error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.createPayment = createPayment;
const getPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 50; // Higher default for now
        const search = req.query.search;
        const status = req.query.status;
        const branchId = req.query.branchId; // Optional branch filter
        const skip = (page - 1) * limit;
        const where = {};
        if (branchId) {
            where.branchId = branchId;
        }
        if (search) {
            where.OR = [
                { student: { firstName: { contains: search, mode: 'insensitive' } } },
                { student: { lastName: { contains: search, mode: 'insensitive' } } },
                { student: { admissionNumber: { contains: search, mode: 'insensitive' } } },
                { transactionId: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (status) {
            where.status = status;
        }
        const [payments, total] = yield Promise.all([
            prisma.payment.findMany({
                where,
                skip,
                take: limit,
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
                    voidedBy: {
                        select: {
                            fullName: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc',
                },
            }),
            prisma.payment.count({ where }),
        ]);
        res.json({
            data: payments,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            }
        });
    }
    catch (error) {
        console.error('Get payments error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getPayments = getPayments;
const getStudentPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { studentId } = req.params;
        const userRole = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
        // Security check for PARENT
        if (userRole === 'PARENT') {
            const student = yield prisma.student.findUnique({
                where: { id: studentId },
                select: { parentId: true }
            });
            if (!student || student.parentId !== userId) {
                return res.status(403).json({ message: 'Unauthorized access to student payments' });
            }
        }
        const payments = yield prisma.payment.findMany({
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
    }
    catch (error) {
        console.error('Get student payments error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getStudentPayments = getStudentPayments;
const getFinanceStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // 1. Total Revenue (Sum of COMPLETED payments only)
        const totalRevenueAgg = yield prisma.payment.aggregate({
            where: { status: 'COMPLETED' },
            _sum: { amount: true },
            _count: { id: true },
        });
        const totalRevenue = Number(totalRevenueAgg._sum.amount || 0);
        const totalTransactions = totalRevenueAgg._count.id;
        // 2. Total Fees Assigned (Sum of all fee structures)
        const totalFeesAgg = yield prisma.studentFeeStructure.aggregate({
            _sum: { amountDue: true },
        });
        const totalFeesAssigned = Number(totalFeesAgg._sum.amountDue || 0);
        // 3. Pending Fees
        // 3. Pending Fees
        const pendingFees = Math.max(0, totalFeesAssigned - totalRevenue);
        // 4. Overdue Students Count
        // Get total due per student
        // Note: This logic needs to be branch-aware if strict branch separation is needed. 
        // For now, it calculates globally or we can filter by branchId if passed.
        // 5. Total Revenue per Branch
        const revenueByBranch = yield prisma.payment.groupBy({
            by: ['branchId'],
            where: { status: 'COMPLETED' },
            _sum: { amount: true },
        });
        // Enrich branch names
        const branches = yield prisma.branch.findMany({ select: { id: true, name: true } });
        const revenueByBranchWithNames = revenueByBranch.map(r => {
            var _a;
            return ({
                branchId: r.branchId,
                branchName: ((_a = branches.find(b => b.id === r.branchId)) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown Branch',
                amount: Number(r._sum.amount || 0)
            });
        });
        // 4. Overdue Students Count
        // Get total due per student
        const feesByStudent = yield prisma.studentFeeStructure.groupBy({
            by: ['studentId'],
            _sum: { amountDue: true },
        });
        // Get total paid per student (COMPLETED only)
        const paymentsByStudent = yield prisma.payment.groupBy({
            by: ['studentId'],
            where: { status: 'COMPLETED' },
            _sum: { amount: true },
        });
        const paymentMap = new Map();
        paymentsByStudent.forEach(p => {
            paymentMap.set(p.studentId, Number(p._sum.amount || 0));
        });
        let overdueCount = 0;
        feesByStudent.forEach(f => {
            const due = Number(f._sum.amountDue || 0);
            const paid = paymentMap.get(f.studentId) || 0;
            if (due > paid)
                overdueCount++;
        });
        // 5. Recent Activity (Show voided ones too, with status)
        const recentActivity = yield prisma.payment.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
                student: { select: { firstName: true, lastName: true } }
            }
        });
        res.json({
            totalRevenue,
            totalTransactions,
            pendingFees,
            overdueCount,
            revenueByBranch: revenueByBranchWithNames, // New breakdown
            recentActivity: recentActivity.map(p => ({
                id: p.id,
                description: `Payment from ${p.student.firstName} ${p.student.lastName}`,
                amount: Number(p.amount),
                date: p.paymentDate,
                status: p.status // Include status for frontend to display
            }))
        });
    }
    catch (error) {
        console.error('Finance stats error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getFinanceStats = getFinanceStats;
const getFinancialReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate, branchId } = req.query;
        const dateFilter = {};
        if (startDate)
            dateFilter.gte = new Date(startDate);
        if (endDate)
            dateFilter.lte = new Date(endDate);
        const paymentWhere = {
            paymentDate: dateFilter,
            status: 'COMPLETED'
        };
        if (branchId) {
            paymentWhere.branchId = branchId;
        }
        // Monthly Revenue (COMPLETED only)
        const payments = yield prisma.payment.findMany({
            where: paymentWhere,
            select: {
                amount: true,
                paymentDate: true
            }
        });
        const monthlyRevenue = new Array(12).fill(0);
        payments.forEach(p => {
            const month = new Date(p.paymentDate).getMonth();
            monthlyRevenue[month] += Number(p.amount);
        });
        // Payment Methods Stats (COMPLETED only)
        const methodsStats = yield prisma.payment.groupBy({
            by: ['method'],
            where: paymentWhere,
            _count: { id: true },
            _sum: { amount: true }
        });
        // 3. Collection by Class
        const classWhere = {};
        if (branchId) {
            classWhere.branchId = branchId;
        }
        const classes = yield prisma.class.findMany({
            where: classWhere,
            select: {
                id: true,
                name: true,
                students: {
                    select: {
                        feeStructures: {
                            select: { amountDue: true }
                        },
                        payments: {
                            where: { status: 'COMPLETED' }, // Ensure we only count completed payments
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
    }
    catch (error) {
        console.error('Financial report error:', error);
        res.status(500).json({ message: 'Failed to generate financial report' });
    }
});
exports.getFinancialReport = getFinancialReport;
// Void/Cancel a payment
const voidPaymentSchema = zod_1.z.object({
    reason: zod_1.z.string().min(5, 'Please provide a reason for voiding this payment'),
});
const voidPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { paymentId } = req.params;
        const parseResult = voidPaymentSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }
        const { reason } = parseResult.data;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        // Find the payment
        const payment = yield prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                student: {
                    select: {
                        firstName: true,
                        lastName: true,
                        admissionNumber: true,
                    }
                }
            }
        });
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        // Verify the user exists (handles stale tokens)
        const voidingUser = yield prisma.user.findUnique({ where: { id: userId } });
        if (!voidingUser) {
            return res.status(401).json({ message: 'Session invalid. Please log out and log in again.' });
        }
        if (payment.status === 'VOIDED') {
            return res.status(400).json({ message: 'This payment has already been voided' });
        }
        // Void the payment
        const voidedPayment = yield prisma.payment.update({
            where: { id: paymentId },
            data: {
                status: 'VOIDED',
                voidedAt: new Date(),
                voidedByUserId: userId,
                voidReason: reason,
            },
            include: {
                student: {
                    select: {
                        firstName: true,
                        lastName: true,
                        admissionNumber: true,
                    }
                },
                recordedBy: {
                    select: {
                        fullName: true,
                    }
                },
                voidedBy: {
                    select: {
                        fullName: true,
                    }
                }
            }
        });
        console.log(`Payment ${paymentId} voided by user ${userId}. Reason: ${reason}`);
        res.json({
            message: 'Payment voided successfully',
            payment: voidedPayment
        });
    }
    catch (error) {
        console.error('Void payment error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.voidPayment = voidPayment;
// Get single payment by ID
const getPaymentById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { paymentId } = req.params;
        const payment = yield prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                student: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        admissionNumber: true,
                        class: {
                            select: {
                                id: true,
                                name: true,
                            }
                        }
                    }
                },
                recordedBy: {
                    select: {
                        id: true,
                        fullName: true,
                    }
                },
                voidedBy: {
                    select: {
                        id: true,
                        fullName: true,
                    }
                }
            }
        });
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        res.json(payment);
    }
    catch (error) {
        console.error('Get payment error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getPaymentById = getPaymentById;
// Get recent payments for a student to check for duplicates
const checkDuplicatePayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId, amount } = req.query;
        if (!studentId || !amount) {
            return res.status(400).json({ message: 'studentId and amount are required' });
        }
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentPayments = yield prisma.payment.findMany({
            where: {
                studentId: studentId,
                amount: Number(amount),
                status: 'COMPLETED',
                createdAt: {
                    gte: fiveMinutesAgo
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                id: true,
                transactionId: true,
                amount: true,
                paymentDate: true,
                method: true,
                createdAt: true,
            }
        });
        res.json({
            hasDuplicateRisk: recentPayments.length > 0,
            recentPayments: recentPayments.map(p => (Object.assign(Object.assign({}, p), { amount: Number(p.amount) })))
        });
    }
    catch (error) {
        console.error('Check duplicate error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.checkDuplicatePayment = checkDuplicatePayment;
// ============================================
// MOBILE MONEY PAYMENT FUNCTIONS (Lenco API)
// ============================================
// Validation schema for mobile money collection
const mobileMoneyPaymentSchema = zod_1.z.object({
    studentId: zod_1.z.string().uuid(),
    amount: zod_1.z.number().positive(),
    phone: zod_1.z.string().min(10).max(15),
    country: zod_1.z.enum(['zm', 'mw']).default('zm'),
    operator: zod_1.z.enum(['airtel', 'mtn', 'tnm']),
    notes: zod_1.z.string().optional(),
});
// Generate unique reference for mobile money collection
const generateMobileMoneyReference = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MM-${timestamp}-${random}`;
};
/**
 * Initiate a mobile money payment collection
 * This sends a payment prompt to the customer's phone
 */
const initiateMobileMoneyPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        const parseResult = mobileMoneyPaymentSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }
        const { studentId, amount, phone, country, operator, notes } = parseResult.data;
        // Calculate 2.5% processing fee
        const processingFee = amount * 0.025;
        const totalCharge = amount + processingFee;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        // Validate operator for country
        if (country === 'zm' && !['airtel', 'mtn'].includes(operator)) {
            return res.status(400).json({ message: 'For Zambia, only airtel or mtn operators are supported' });
        }
        if (country === 'mw' && !['airtel', 'tnm'].includes(operator)) {
            return res.status(400).json({ message: 'For Malawi, only airtel or tnm operators are supported' });
        }
        // Check if student exists
        const student = yield prisma.student.findUnique({
            where: { id: studentId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                admissionNumber: true,
                guardianPhone: true,
                parentId: true,
            }
        });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        // Security Check: If user is PARENT, ensure they are the parent of this student
        if (req.user.role === 'PARENT') {
            if (student.parentId !== userId) {
                return res.status(403).json({ message: 'Unauthorized: You can only make payments for your own children' });
            }
        }
        // Generate unique reference
        const reference = generateMobileMoneyReference();
        // Generate transaction ID for the payment
        const transactionId = generateTransactionId();
        // Create the collection record and pending payment in our database first
        const collection = yield prisma.mobileMoneyCollection.create({
            data: {
                reference,
                studentId,
                amount: totalCharge,
                phone,
                country,
                operator,
                initiatedByUserId: userId,
                status: 'PENDING',
            },
        });
        // Create Payment record with PENDING status
        const pendingPayment = yield prisma.payment.create({
            data: {
                transactionId,
                studentId,
                amount: Number(totalCharge) / 1.025, // Record tuition amount (exclude processing fee)
                method: 'MOBILE_MONEY',
                notes: `Mobile Money payment via ${operator.toUpperCase()}. Ref: ${reference}`,
                status: 'PENDING',
                recordedByUserId: userId,
            },
        });
        // Link the payment to the collection
        yield prisma.mobileMoneyCollection.update({
            where: { id: collection.id },
            data: { paymentId: pendingPayment.id },
        });
        // Call Lenco API to initiate the collection
        const lencoResult = yield (0, lencoService_1.initiateMobileMoneyCollection)({
            amount: totalCharge,
            phone,
            country: country,
            operator: operator,
            reference,
        });
        if (!lencoResult.success) {
            // Update collection status to FAILED
            yield prisma.mobileMoneyCollection.update({
                where: { id: collection.id },
                data: {
                    status: 'FAILED',
                    reasonForFailure: lencoResult.error,
                },
            });
            return res.status(400).json({
                message: 'Failed to initiate mobile money collection',
                error: lencoResult.error,
            });
        }
        // Update collection with Lenco response
        const updatedCollection = yield prisma.mobileMoneyCollection.update({
            where: { id: collection.id },
            data: {
                lencoReference: (_b = lencoResult.data) === null || _b === void 0 ? void 0 : _b.lencoReference,
                lencoCollectionId: (_c = lencoResult.data) === null || _c === void 0 ? void 0 : _c.id,
                status: ((_d = lencoResult.data) === null || _d === void 0 ? void 0 : _d.status) === 'pay-offline' ? 'PAY_OFFLINE' : 'PENDING',
                fee: ((_e = lencoResult.data) === null || _e === void 0 ? void 0 : _e.fee) ? parseFloat(lencoResult.data.fee) : null,
                accountName: (_g = (_f = lencoResult.data) === null || _f === void 0 ? void 0 : _f.mobileMoneyDetails) === null || _g === void 0 ? void 0 : _g.accountName,
            },
            include: {
                student: {
                    select: {
                        firstName: true,
                        lastName: true,
                        admissionNumber: true,
                    }
                }
            }
        });
        console.log(`Mobile money collection initiated: ${reference} for student ${studentId}`);
        res.status(201).json({
            message: 'Mobile money payment request initiated. Customer will receive a prompt to authorize payment.',
            collection: {
                id: updatedCollection.id,
                reference: updatedCollection.reference,
                lencoReference: updatedCollection.lencoReference,
                amount: Number(updatedCollection.amount),
                phone: updatedCollection.phone,
                operator: updatedCollection.operator,
                status: updatedCollection.status,
                student: updatedCollection.student,
                initiatedAt: updatedCollection.initiatedAt,
            },
            nextSteps: [
                'Customer should authorize payment on their phone',
                'Use the /check-status endpoint to poll for payment completion',
                'Or wait for webhook notification at /webhook/lenco',
            ]
        });
    }
    catch (error) {
        console.error('Initiate mobile money payment error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.initiateMobileMoneyPayment = initiateMobileMoneyPayment;
/**
 * Check the status of a mobile money collection
 */
const checkMobileMoneyStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        const { reference } = req.params;
        if (!reference) {
            return res.status(400).json({ message: 'Reference is required' });
        }
        // Find the collection in our database
        const collection = yield prisma.mobileMoneyCollection.findUnique({
            where: { reference },
            include: {
                student: {
                    select: {
                        firstName: true,
                        lastName: true,
                        admissionNumber: true,
                    }
                },
                payment: true,
            }
        });
        if (!collection) {
            return res.status(404).json({ message: 'Collection not found' });
        }
        // If already successful or failed, return cached status
        if (collection.status === 'SUCCESSFUL' || collection.status === 'FAILED') {
            return res.json({
                collection: {
                    id: collection.id,
                    reference: collection.reference,
                    amount: Number(collection.amount),
                    status: collection.status,
                    student: collection.student,
                    payment: collection.payment ? {
                        id: collection.payment.id,
                        transactionId: collection.payment.transactionId,
                    } : null,
                    completedAt: collection.completedAt,
                    reasonForFailure: collection.reasonForFailure,
                }
            });
        }
        // Query Lenco API for latest status
        const lencoResult = yield (0, lencoService_1.getCollectionStatus)(reference);
        if (!lencoResult.success) {
            return res.json({
                collection: {
                    id: collection.id,
                    reference: collection.reference,
                    amount: Number(collection.amount),
                    status: collection.status,
                    student: collection.student,
                    error: 'Could not fetch latest status from payment provider',
                }
            });
        }
        // Map Lenco status to our status
        let newStatus = collection.status;
        if (((_a = lencoResult.data) === null || _a === void 0 ? void 0 : _a.status) === 'successful') {
            newStatus = 'SUCCESSFUL';
        }
        else if (((_b = lencoResult.data) === null || _b === void 0 ? void 0 : _b.status) === 'failed') {
            newStatus = 'FAILED';
        }
        else if (((_c = lencoResult.data) === null || _c === void 0 ? void 0 : _c.status) === 'pay-offline') {
            newStatus = 'PAY_OFFLINE';
        }
        // If status changed, update the collection
        if (newStatus !== collection.status) {
            const updatedCollection = yield prisma.mobileMoneyCollection.update({
                where: { id: collection.id },
                data: {
                    status: newStatus,
                    completedAt: newStatus === 'SUCCESSFUL' ? new Date() : null,
                    reasonForFailure: (_d = lencoResult.data) === null || _d === void 0 ? void 0 : _d.reasonForFailure,
                    operatorTransactionId: (_f = (_e = lencoResult.data) === null || _e === void 0 ? void 0 : _e.mobileMoneyDetails) === null || _f === void 0 ? void 0 : _f.operatorTransactionId,
                    accountName: (_h = (_g = lencoResult.data) === null || _g === void 0 ? void 0 : _g.mobileMoneyDetails) === null || _h === void 0 ? void 0 : _h.accountName,
                },
            });
            // Update payment status based on collection result
            if (newStatus === 'SUCCESSFUL' && collection.paymentId) {
                yield updatePaymentFromCollection(Object.assign(Object.assign({}, collection), { paymentId: collection.paymentId }), 'COMPLETED');
            }
            else if (newStatus === 'FAILED' && collection.paymentId) {
                yield updatePaymentFromCollection(Object.assign(Object.assign({}, collection), { paymentId: collection.paymentId }), 'FAILED');
            }
            // If successful, return with payment info
            if (newStatus === 'SUCCESSFUL') {
                return res.json({
                    collection: {
                        id: updatedCollection.id,
                        reference: updatedCollection.reference,
                        amount: Number(updatedCollection.amount),
                        status: updatedCollection.status,
                        student: collection.student,
                        payment: collection.payment ? {
                            id: collection.payment.id,
                            transactionId: collection.payment.transactionId,
                        } : null,
                        completedAt: updatedCollection.completedAt,
                    },
                    message: 'Payment completed successfully',
                });
            }
        }
        res.json({
            collection: {
                id: collection.id,
                reference: collection.reference,
                amount: Number(collection.amount),
                status: newStatus,
                student: collection.student,
                reasonForFailure: (_j = lencoResult.data) === null || _j === void 0 ? void 0 : _j.reasonForFailure,
            }
        });
    }
    catch (error) {
        console.error('Check mobile money status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.checkMobileMoneyStatus = checkMobileMoneyStatus;
/**
 * Helper function to update payment status from mobile money collection
 */
function updatePaymentFromCollection(collection, newStatus) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            if (!collection.paymentId) {
                console.error(`No payment linked to collection ${collection.reference}`);
                return null;
            }
            // Update payment status
            const paymentStatus = newStatus === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
            const payment = yield prisma.payment.update({
                where: { id: collection.paymentId },
                data: {
                    status: paymentStatus,
                },
            });
            console.log(`Payment ${payment.transactionId} updated to ${newStatus} from collection ${collection.reference}`);
            // Send notification to parent on successful payment
            if (newStatus === 'COMPLETED') {
                // Fetch student with parent info for notification
                const student = yield prisma.student.findUnique({
                    where: { id: payment.studentId },
                    include: { parent: true },
                });
                if (student) {
                    const guardianEmail = student.guardianEmail || ((_a = student.parent) === null || _a === void 0 ? void 0 : _a.email);
                    const guardianPhone = student.guardianPhone; // Phone from student record
                    const guardianName = student.guardianName || ((_b = student.parent) === null || _b === void 0 ? void 0 : _b.fullName) || 'Parent/Guardian';
                    // Get school name
                    const settings = yield prisma.schoolSettings.findFirst();
                    const schoolName = (settings === null || settings === void 0 ? void 0 : settings.schoolName) || 'School';
                    // Generate email/SMS content
                    const { subject, text, html, sms } = (0, notificationService_1.generatePaymentReceiptEmail)(guardianName, `${student.firstName} ${student.lastName}`, Number(payment.amount), new Date(), 'MOBILE_MONEY', payment.transactionId || collection.reference, schoolName);
                    // Send email and SMS
                    const { emailSent, smsSent } = yield (0, notificationService_1.sendNotification)(guardianEmail || undefined, guardianPhone || undefined, subject, text, html, sms);
                    console.log(`Payment notification sent - Email: ${emailSent}, SMS: ${smsSent}`);
                }
            }
            return payment;
        }
        catch (error) {
            console.error('Error updating payment from collection:', error);
            return null;
        }
    });
}
/**
 * Webhook endpoint for Lenco to notify us of payment status changes
 */
const handleLencoWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const payload = req.body;
        console.log('Lenco webhook received:', JSON.stringify(payload, null, 2));
        // Extract relevant data from webhook
        const { reference, status, reasonForFailure, mobileMoneyDetails } = payload.data || {};
        if (!reference) {
            console.log('Webhook missing reference');
            return res.status(400).json({ message: 'Missing reference' });
        }
        // Find the collection
        const collection = yield prisma.mobileMoneyCollection.findUnique({
            where: { reference },
        });
        if (!collection) {
            console.log(`Collection not found for reference: ${reference}`);
            return res.status(404).json({ message: 'Collection not found' });
        }
        // Map Lenco status to our status
        let newStatus = collection.status;
        if (status === 'successful') {
            newStatus = 'SUCCESSFUL';
        }
        else if (status === 'failed') {
            newStatus = 'FAILED';
        }
        else if (status === 'pay-offline') {
            newStatus = 'PAY_OFFLINE';
        }
        // Update collection status
        const updatedCollection = yield prisma.mobileMoneyCollection.update({
            where: { id: collection.id },
            data: {
                status: newStatus,
                completedAt: newStatus === 'SUCCESSFUL' ? new Date() : null,
                reasonForFailure: reasonForFailure || null,
                operatorTransactionId: mobileMoneyDetails === null || mobileMoneyDetails === void 0 ? void 0 : mobileMoneyDetails.operatorTransactionId,
                accountName: mobileMoneyDetails === null || mobileMoneyDetails === void 0 ? void 0 : mobileMoneyDetails.accountName,
            },
        });
        // Update payment status based on collection result
        if (newStatus === 'SUCCESSFUL' && updatedCollection.paymentId) {
            yield updatePaymentFromCollection(updatedCollection, 'COMPLETED');
        }
        else if (newStatus === 'FAILED' && updatedCollection.paymentId) {
            yield updatePaymentFromCollection(updatedCollection, 'FAILED');
        }
        console.log(`Webhook processed for collection ${reference}: ${newStatus}`);
        // Respond to webhook
        res.status(200).json({ received: true });
    }
    catch (error) {
        console.error('Lenco webhook error:', error);
        res.status(500).json({ message: 'Webhook processing failed' });
    }
});
exports.handleLencoWebhook = handleLencoWebhook;
/**
 * Get all mobile money collections (with pagination)
 */
const getMobileMoneyCollections = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const status = req.query.status;
        const studentId = req.query.studentId;
        const skip = (page - 1) * limit;
        const where = {};
        if (status) {
            where.status = status.toUpperCase();
        }
        if (studentId) {
            where.studentId = studentId;
        }
        // Security Check: If user is PARENT, only show collections for their children
        if (req.user.role === 'PARENT') {
            const parentId = req.user.userId;
            where.student = { parentId };
        }
        const [collections, total] = yield Promise.all([
            prisma.mobileMoneyCollection.findMany({
                where,
                skip,
                take: limit,
                include: {
                    student: {
                        select: {
                            firstName: true,
                            lastName: true,
                            admissionNumber: true,
                        }
                    },
                    payment: {
                        select: {
                            id: true,
                            transactionId: true,
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.mobileMoneyCollection.count({ where }),
        ]);
        res.json({
            data: collections.map(c => (Object.assign(Object.assign({}, c), { amount: Number(c.amount), fee: c.fee ? Number(c.fee) : null }))),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            }
        });
    }
    catch (error) {
        console.error('Get mobile money collections error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getMobileMoneyCollections = getMobileMoneyCollections;
/**
 * Get a single mobile money collection by ID
 */
const getMobileMoneyCollectionById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { collectionId } = req.params;
        const collection = yield prisma.mobileMoneyCollection.findUnique({
            where: { id: collectionId },
            include: {
                student: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        admissionNumber: true,
                        guardianPhone: true,
                        guardianEmail: true,
                        class: {
                            select: {
                                id: true,
                                name: true,
                            }
                        }
                    }
                },
                payment: {
                    select: {
                        id: true,
                        transactionId: true,
                        paymentDate: true,
                        status: true,
                    }
                }
            }
        });
        if (!collection) {
            return res.status(404).json({ message: 'Collection not found' });
        }
        // Security Check: If user is PARENT, ensure they own this collection
        if (req.user.role === 'PARENT') {
            const parentId = req.user.userId;
            // We need to check if the student belongs to this parent
            // The collection includes student, but let's check the student.parentId
            // We didn't include parentId in the query above, let's fix that or rely on initiatedByUserId if that's trustworthy, 
            // but parent might not have initiated it (maybe initiated by admin?).
            // Better to check Student link.
            const student = yield prisma.student.findUnique({
                where: { id: collection.studentId },
                select: { parentId: true }
            });
            if ((student === null || student === void 0 ? void 0 : student.parentId) !== parentId) {
                return res.status(403).json({ message: 'Unauthorized' });
            }
        }
        res.json(Object.assign(Object.assign({}, collection), { amount: Number(collection.amount), fee: collection.fee ? Number(collection.fee) : null }));
    }
    catch (error) {
        console.error('Get mobile money collection error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getMobileMoneyCollectionById = getMobileMoneyCollectionById;
// ============================================
// PUBLIC PAYMENT FUNCTIONS
// ============================================
const getStudentForPublicPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { identifier } = req.params;
        if (!identifier) {
            return res.status(400).json({ message: 'Student Identifier is required' });
        }
        const student = yield prisma.student.findFirst({
            where: {
                OR: [
                    { id: identifier },
                    { admissionNumber: identifier }
                ]
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                admissionNumber: true,
                class: { select: { name: true } }
            }
        });
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }
        // Calculate Balance
        const totalFees = yield prisma.studentFeeStructure.aggregate({
            where: { studentId: student.id },
            _sum: { amountDue: true }
        });
        const totalPayments = yield prisma.payment.aggregate({
            where: {
                studentId: student.id,
                status: 'COMPLETED'
            },
            _sum: { amount: true }
        });
        const due = Number(totalFees._sum.amountDue || 0);
        const paid = Number(totalPayments._sum.amount || 0);
        const balance = due - paid;
        res.json(Object.assign(Object.assign({}, student), { balance }));
    }
    catch (error) {
        console.error('Public Get Student Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getStudentForPublicPayment = getStudentForPublicPayment;
const initiatePublicMobileMoneyPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    try {
        const parseResult = mobileMoneyPaymentSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }
        const { studentId, amount, phone, country, operator, notes } = parseResult.data;
        // Calculate 2.5% processing fee
        const processingFee = amount * 0.025;
        const totalCharge = amount + processingFee;
        if (country === 'zm' && !['airtel', 'mtn'].includes(operator)) {
            return res.status(400).json({ message: 'For Zambia, only airtel or mtn operators are supported' });
        }
        const student = yield prisma.student.findUnique({ where: { id: studentId } });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        const reference = generateMobileMoneyReference();
        const transactionId = generateTransactionId();
        const collection = yield prisma.mobileMoneyCollection.create({
            data: {
                reference,
                studentId,
                amount: totalCharge,
                phone,
                country,
                operator,
                status: 'PENDING',
            },
        });
        // Create Payment record with PENDING status
        const pendingPayment = yield prisma.payment.create({
            data: {
                transactionId,
                studentId,
                amount: Number(totalCharge) / 1.025, // Record tuition amount (exclude processing fee)
                method: 'MOBILE_MONEY',
                notes: `Mobile Money payment via ${operator.toUpperCase()}. Ref: ${reference}`,
                status: 'PENDING',
                recordedByUserId: null, // Public payment has no recorded user
            },
        });
        // Link the payment to the collection
        yield prisma.mobileMoneyCollection.update({
            where: { id: collection.id },
            data: { paymentId: pendingPayment.id },
        });
        const lencoResult = yield (0, lencoService_1.initiateMobileMoneyCollection)({
            amount: totalCharge,
            phone,
            country: country,
            operator: operator,
            reference,
        });
        if (!lencoResult.success) {
            yield prisma.mobileMoneyCollection.update({
                where: { id: collection.id },
                data: {
                    status: 'FAILED',
                    reasonForFailure: lencoResult.error,
                },
            });
            return res.status(400).json({
                message: 'Failed to initiate mobile money collection',
                error: lencoResult.error,
            });
        }
        const updatedCollection = yield prisma.mobileMoneyCollection.update({
            where: { id: collection.id },
            data: {
                lencoReference: (_a = lencoResult.data) === null || _a === void 0 ? void 0 : _a.lencoReference,
                lencoCollectionId: (_b = lencoResult.data) === null || _b === void 0 ? void 0 : _b.id,
                status: ((_c = lencoResult.data) === null || _c === void 0 ? void 0 : _c.status) === 'pay-offline' ? 'PAY_OFFLINE' : 'PENDING',
                fee: ((_d = lencoResult.data) === null || _d === void 0 ? void 0 : _d.fee) ? parseFloat(lencoResult.data.fee) : null,
                accountName: (_f = (_e = lencoResult.data) === null || _e === void 0 ? void 0 : _e.mobileMoneyDetails) === null || _f === void 0 ? void 0 : _f.accountName,
            },
        });
        res.status(201).json({
            message: 'Mobile money payment request initiated.',
            collection: {
                id: updatedCollection.id,
                reference: updatedCollection.reference,
                amount: Number(updatedCollection.amount),
                phone: updatedCollection.phone,
                operator: updatedCollection.operator,
                status: updatedCollection.status,
            },
        });
    }
    catch (error) {
        console.error('Public Initiate Payment Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.initiatePublicMobileMoneyPayment = initiatePublicMobileMoneyPayment;
