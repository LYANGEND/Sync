/**
 * Example Express Routes for Mobishastra SMS Integration
 * Add these routes to your backend API
 * 
 * File: src/routes/smsRoutes.ts
 */

import express, { Request, Response } from 'express';
import smsService from '../services/smsService';
import { authenticateUser } from '../middleware/auth'; // Your auth middleware
import { prisma } from '../utils/prisma';

const router = express.Router();

/**
 * POST /api/sms/send
 * Send a single SMS message
 * 
 * Body:
 * {
 *   "phoneNumber": "0966123456",
 *   "message": "Hello test SMS",
 *   "recipientName": "John Doe" (optional),
 *   "source": "manual" (optional)
 * }
 */
router.post('/send', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { phoneNumber, message, recipientName, source } = req.body;

    // Validate input
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber and message are required',
      });
    }

    if (message.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Message exceeds maximum length (1000 characters)',
      });
    }

    // Send SMS
    const result = await smsService.send(phoneNumber, message, {
      source: source || 'manual_sms',
      sentById: req.user?.id,
      recipientName,
    });

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    });
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/sms/send-bulk
 * Send SMS to multiple recipients
 * 
 * Body:
 * {
 *   "recipients": [
 *     { "phone": "0966123456", "message": "Hello test" },
 *     { "phone": "0977654321", "message": "Hello test" }
 *   ]
 * }
 */
router.post('/send-bulk', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { recipients } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'recipients array is required and must not be empty',
      });
    }

    if (recipients.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Cannot send more than 1000 messages at once',
      });
    }

    // Validate each recipient
    for (const recipient of recipients) {
      if (!recipient.phone || !recipient.message) {
        return res.status(400).json({
          success: false,
          error: 'Each recipient must have phone and message',
        });
      }
    }

    // Send bulk SMS
    const results = await smsService.sendBulk(recipients);

    res.json({
      success: results.sent > 0,
      total: results.total,
      sent: results.sent,
      failed: results.failed,
      results: results.results,
    });
  } catch (error) {
    console.error('Error sending bulk SMS:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/sms/send-fee-reminder
 * Send fee reminder SMS to parent
 * 
 * Body:
 * {
 *   "parentId": "xyz123",
 *   "studentId": "abc456",
 *   "amount": 250.00,
 *   "dueDate": "2024-04-30"
 * }
 */
router.post('/send-fee-reminder', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { parentId, studentId, amount, dueDate } = req.body;

    // Validate input
    if (!parentId || !studentId || !amount || !dueDate) {
      return res.status(400).json({
        success: false,
        error: 'parentId, studentId, amount, and dueDate are required',
      });
    }

    // Get parent and student info
    const [parent, student, school] = await Promise.all([
      prisma.parent.findUnique({ where: { id: parentId } }),
      prisma.student.findUnique({ where: { id: studentId } }),
      prisma.schoolSettings.findFirst(),
    ]);

    if (!parent || !student) {
      return res.status(404).json({
        success: false,
        error: 'Parent or Student not found',
      });
    }

    if (!parent.phone) {
      return res.status(400).json({
        success: false,
        error: 'Parent has no phone number registered',
      });
    }

    // Send reminder
    const result = await smsService.sendFeeReminder(
      parent.phone,
      student.name,
      amount,
      dueDate,
      school?.name || 'School'
    );

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    });
  } catch (error) {
    console.error('Error sending fee reminder SMS:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/sms/send-attendance-alert
 * Send attendance alert SMS to parent
 * 
 * Body:
 * {
 *   "parentId": "xyz123",
 *   "studentId": "abc456",
 *   "absentDays": 3
 * }
 */
router.post('/send-attendance-alert', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { parentId, studentId, absentDays } = req.body;

    // Validate input
    if (!parentId || !studentId || !absentDays) {
      return res.status(400).json({
        success: false,
        error: 'parentId, studentId, and absentDays are required',
      });
    }

    // Get parent and student info
    const [parent, student, school] = await Promise.all([
      prisma.parent.findUnique({ where: { id: parentId } }),
      prisma.student.findUnique({ where: { id: studentId } }),
      prisma.schoolSettings.findFirst(),
    ]);

    if (!parent || !student) {
      return res.status(404).json({
        success: false,
        error: 'Parent or Student not found',
      });
    }

    if (!parent.phone) {
      return res.status(400).json({
        success: false,
        error: 'Parent has no phone number registered',
      });
    }

    // Send alert
    const result = await smsService.sendAttendanceAlert(
      parent.phone,
      student.name,
      absentDays,
      school?.name || 'School'
    );

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    });
  } catch (error) {
    console.error('Error sending attendance alert SMS:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/sms/send-payment-confirmation
 * Send payment confirmation SMS
 * 
 * Body:
 * {
 *   "parentId": "xyz123",
 *   "studentId": "abc456",
 *   "amount": 250.00,
 *   "transactionId": "TXN12345"
 * }
 */
router.post('/send-payment-confirmation', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { parentId, studentId, amount, transactionId } = req.body;

    // Validate input
    if (!parentId || !studentId || !amount || !transactionId) {
      return res.status(400).json({
        success: false,
        error: 'parentId, studentId, amount, and transactionId are required',
      });
    }

    // Get parent and student info
    const [parent, student, school] = await Promise.all([
      prisma.parent.findUnique({ where: { id: parentId } }),
      prisma.student.findUnique({ where: { id: studentId } }),
      prisma.schoolSettings.findFirst(),
    ]);

    if (!parent || !student) {
      return res.status(404).json({
        success: false,
        error: 'Parent or Student not found',
      });
    }

    if (!parent.phone) {
      return res.status(400).json({
        success: false,
        error: 'Parent has no phone number registered',
      });
    }

    // Send confirmation
    const result = await smsService.sendPaymentConfirmation(
      parent.phone,
      student.name,
      amount,
      transactionId,
      school?.name || 'School'
    );

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    });
  } catch (error) {
    console.error('Error sending payment confirmation SMS:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/sms/history
 * Get SMS sending history with optional filters
 * 
 * Query params:
 * - limit: number (default: 50, max: 500)
 * - status: PENDING|SENT|FAILED
 * - source: fee_reminder|attendance_alert|etc
 * - phone: Filter by phone number
 */
router.get('/history', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { limit = 50, status, source, phone } = req.query;

    // Validate limit
    const parsedLimit = Math.min(parseInt(limit as string) || 50, 500);

    // Build filter
    const where: any = { channel: 'SMS' };
    if (status) where.status = status;
    if (source) where.source = source;
    if (phone) where.recipientPhone = phone;

    // Get logs
    const logs = await prisma.communicationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parsedLimit,
    });

    res.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error) {
    console.error('Error fetching SMS history:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/sms/statistics
 * Get SMS statistics and analytics
 */
router.get('/statistics', authenticateUser, async (req: Request, res: Response) => {
  try {
    // Get overall stats
    const totalLogs = await prisma.communicationLog.count({
      where: { channel: 'SMS' },
    });

    const sentCount = await prisma.communicationLog.count({
      where: { channel: 'SMS', status: 'SENT' },
    });

    const failedCount = await prisma.communicationLog.count({
      where: { channel: 'SMS', status: 'FAILED' },
    });

    // Get stats by source
    const statsBySource = await prisma.communicationLog.groupBy({
      by: ['source'],
      where: { channel: 'SMS' },
      _count: true,
    });

    // Get stats by date (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentLogs = await prisma.communicationLog.findMany({
      where: {
        channel: 'SMS',
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    res.json({
      success: true,
      overall: {
        total: totalLogs,
        sent: sentCount,
        failed: failedCount,
        successRate: totalLogs > 0 ? ((sentCount / totalLogs) * 100).toFixed(2) : 0,
      },
      bySource: statsBySource,
      last30Days: {
        count: recentLogs.length,
        sent: recentLogs.filter(l => l.status === 'SENT').length,
        failed: recentLogs.filter(l => l.status === 'FAILED').length,
      },
    });
  } catch (error) {
    console.error('Error fetching SMS statistics:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/sms/test
 * Test SMS configuration
 */
router.post('/test', authenticateUser, async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber is required',
      });
    }

    // Send test SMS
    const result = await smsService.send(
      phoneNumber,
      'Test SMS from School Management System - If you received this, SMS is working!',
      {
        source: 'test_sms',
        sentById: req.user?.id,
      }
    );

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      message: result.success 
        ? 'Test SMS sent successfully' 
        : 'Test SMS failed - check error details',
    });
  } catch (error) {
    console.error('Error sending test SMS:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;

/**
 * Integration in Express App
 * 
 * In your src/app.ts or src/server.ts:
 * 
 * import smsRoutes from './routes/smsRoutes';
 * 
 * app.use('/api/sms', smsRoutes);
 */
