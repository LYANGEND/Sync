/**
 * Example: Mobishastra SMS Integration in Controllers
 * This file shows how to integrate Mobishastra SMS into various controllers
 */

import smsService from '../services/smsService';
import { prisma } from '../utils/prisma';

/**
 * Example 1: Send Attendance Alert SMS
 * Called when a student's absence reaches a threshold
 */
export const sendAttendanceAlertViaSMS = async (
  studentId: string,
  parentId: string,
  absentDays: number
) => {
  try {
    const [student, parent, school] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId } }),
      prisma.parent.findUnique({ where: { id: parentId } }),
      prisma.schoolSettings.findFirst(),
    ]);

    if (!parent?.phone || !student) {
      console.warn(`Cannot send SMS: Missing parent phone or student data`);
      return;
    }

    const result = await smsService.sendAttendanceAlert(
      parent.phone,
      student.name,
      absentDays,
      school?.name || 'School'
    );

    if (!result.success) {
      console.error(`SMS failed for parent ${parentId}:`, result.error);
    }
  } catch (error) {
    console.error('Error sending attendance alert SMS:', error);
  }
};

/**
 * Example 2: Send Fee Reminder SMS
 * Called before fee due date or when payment is overdue
 */
export const sendFeeReminderViaSMS = async (
  studentId: string,
  parentId: string,
  amount: number,
  dueDate: Date
) => {
  try {
    const [student, parent, school] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId } }),
      prisma.parent.findUnique({ where: { id: parentId } }),
      prisma.schoolSettings.findFirst(),
    ]);

    if (!parent?.phone || !student) {
      console.warn(`Cannot send SMS: Missing parent phone or student data`);
      return;
    }

    const formattedDate = dueDate.toLocaleDateString('en-ZM');
    
    const result = await smsService.sendFeeReminder(
      parent.phone,
      student.name,
      amount,
      formattedDate,
      school?.name || 'School'
    );

    if (!result.success) {
      console.error(`Fee reminder SMS failed for parent ${parentId}:`, result.error);
    }
  } catch (error) {
    console.error('Error sending fee reminder SMS:', error);
  }
};

/**
 * Example 3: Send Payment Confirmation SMS
 * Called after successful payment processing
 */
export const sendPaymentConfirmationViaSMS = async (
  studentId: string,
  parentId: string,
  amount: number,
  transactionId: string
) => {
  try {
    const [student, parent, school] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId } }),
      prisma.parent.findUnique({ where: { id: parentId } }),
      prisma.schoolSettings.findFirst(),
    ]);

    if (!parent?.phone || !student) {
      console.warn(`Cannot send SMS: Missing parent phone or student data`);
      return;
    }

    const result = await smsService.sendPaymentConfirmation(
      parent.phone,
      student.name,
      amount,
      transactionId,
      school?.name || 'School'
    );

    if (!result.success) {
      console.error(`Payment confirmation SMS failed for parent ${parentId}:`, result.error);
    }
  } catch (error) {
    console.error('Error sending payment confirmation SMS:', error);
  }
};

/**
 * Example 4: Send Bulk SMS to All Parents
 * Called for school-wide announcements
 */
export const sendBulkAnnouncementSMS = async (
  message: string,
  filterByClass?: string // Optional: send only to parents in a specific class
) => {
  try {
    let parents = await prisma.parent.findMany({
      where: {
        phone: { not: null },
        // Optional: filter by student's class
        ...(filterByClass && {
          students: {
            some: {
              classId: filterByClass,
            },
          },
        }),
      },
      select: { id: true, phone: true },
    });

    if (parents.length === 0) {
      console.warn('No parents with phone numbers found');
      return;
    }

    const recipients = parents.map(p => ({
      phone: p.phone!,
      message: message,
    }));

    const results = await smsService.sendBulk(recipients);

    console.log(
      `Bulk SMS: Sent ${results.sent}/${results.total}, Failed: ${results.failed}`
    );

    return results;
  } catch (error) {
    console.error('Error sending bulk announcement SMS:', error);
  }
};

/**
 * Example 5: Send Custom SMS
 * For flexible message content
 */
export const sendCustomSMS = async (
  phoneNumber: string,
  message: string,
  options?: {
    source?: string;
    sentById?: string;
    recipientName?: string;
  }
) => {
  try {
    const result = await smsService.send(phoneNumber, message, options);

    if (!result.success) {
      console.error(`Custom SMS failed to ${phoneNumber}:`, result.error);
    }

    return result;
  } catch (error) {
    console.error('Error sending custom SMS:', error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Example 6: Send Grade Notification SMS
 * Called when grades are published
 */
export const sendGradeNotificationSMS = async (
  studentId: string,
  parentId: string,
  subject: string,
  grade: string,
  gradePoint: number
) => {
  try {
    const [student, parent, school] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId } }),
      prisma.parent.findUnique({ where: { id: parentId } }),
      prisma.schoolSettings.findFirst(),
    ]);

    if (!parent?.phone || !student) {
      console.warn(`Cannot send SMS: Missing parent phone or student data`);
      return;
    }

    const message = `${student.name}'s grade for ${subject}: ${grade} (${gradePoint}/100) at ${school?.name || 'School'}. Keep up the good work!`;

    const result = await smsService.send(parent.phone, message, {
      source: 'grade_notification',
      recipientName: parent.name,
      sentById: undefined,
    });

    if (!result.success) {
      console.error(`Grade notification SMS failed for parent ${parentId}:`, result.error);
    }
  } catch (error) {
    console.error('Error sending grade notification SMS:', error);
  }
};

/**
 * Example 7: Scheduled SMS Job
 * To be used with a job scheduler (e.g., Agenda, Bull Queue)
 */
export const scheduleFeeReminderSMS = async () => {
  try {
    // Find all fees due within the next 7 days
    const dueFeesData = await prisma.fees.findMany({
      where: {
        dueDate: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next 7 days
        },
        status: { not: 'PAID' },
      },
      include: {
        student: true,
      },
    });

    let smsSent = 0;
    let smsFailed = 0;

    for (const fee of dueFeesData) {
      const parent = await prisma.parent.findFirst({
        where: {
          students: {
            some: { id: fee.studentId },
          },
        },
      });

      if (parent?.phone) {
        const result = await sendFeeReminderViaSMS(
          fee.studentId,
          parent.id,
          fee.amount,
          fee.dueDate
        );

        if (result?.success) smsSent++;
        else smsFailed++;
      }
    }

    console.log(`Fee reminder SMS: Sent ${smsSent}, Failed ${smsFailed}`);
  } catch (error) {
    console.error('Error in scheduled fee reminder SMS:', error);
  }
};

/**
 * Example 8: API Endpoint to Send SMS
 * For use in Express routes
 */
export const sendSMSEndpoint = async (req: any, res: any) => {
  try {
    const { phoneNumber, message, source, recipientName } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing phoneNumber or message',
      });
    }

    const result = await smsService.send(phoneNumber, message, {
      source: source || 'manual_sms',
      sentById: req.user?.id,
      recipientName,
    });

    res.json(result);
  } catch (error) {
    console.error('Error in SMS endpoint:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Example 9: Check SMS Status
 * Retrieve SMS sending history from CommunicationLog
 */
export const getSMSHistory = async (
  parentId?: string,
  limit: number = 50
) => {
  try {
    const logs = await prisma.communicationLog.findMany({
      where: {
        channel: 'SMS',
        ...(parentId && { sentById: parentId }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs;
  } catch (error) {
    console.error('Error retrieving SMS history:', error);
    return [];
  }
};

/**
 * Example 10: Validate Phone Number Before Sending
 */
export const validateAndSendSMS = async (
  phoneNumber: string,
  message: string
) => {
  try {
    // Validate phone number format
    const phoneRegex = /^(?:\+?260|0)[\d\s\-\(\)]{7,}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return {
        success: false,
        error: 'Invalid phone number format. Use Zambian format (0, +260, or 260)',
      };
    }

    // Validate message length
    if (message.length === 0) {
      return {
        success: false,
        error: 'Message cannot be empty',
      };
    }

    if (message.length > 1000) {
      return {
        success: false,
        error: 'Message exceeds maximum length (1000 characters)',
      };
    }

    // Send SMS
    return await smsService.send(phoneNumber, message, {
      source: 'validated_sms',
    });
  } catch (error) {
    console.error('Error in validate and send SMS:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
};
