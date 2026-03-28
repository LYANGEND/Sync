import { Request, Response } from 'express';
import { z } from 'zod';
import smsService from '../services/smsService';

/**
 * SMS Controller — dedicated API endpoints for sending SMS messages
 * via the configured SMS provider (mShastra, Twilio, Africa's Talking).
 *
 * mShastra endpoints used:
 *   POST /api/v1/sms/send       → sendurl.aspx        (single)
 *   POST /api/v1/sms/bulk       → sendsms_api_json.aspx (per-recipient messages)
 *   POST /api/v1/sms/broadcast  → sendurlcomma.aspx    (same msg, comma-separated)
 *   GET  /api/v1/sms/balance    → balance.aspx
 */

// ─── Send a single SMS ──────────────────────────────────────

const sendSmsSchema = z.object({
  phone: z.string().min(5, 'Phone number is required'),
  message: z.string().min(1, 'Message is required').max(1600, 'Message too long'),
  scheduledAt: z.string().datetime({ offset: true }).optional(),  // ISO-8601
});

export const sendSingleSms = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { phone, message, scheduledAt } = sendSmsSchema.parse(req.body);

    const result = await smsService.send(phone, message, {
      source: 'sms_api',
      sentById: userId,
      scheduledAt,
    });

    if (result.success) {
      return res.json({
        success: true,
        messageId: result.messageId,
        errorCode: result.errorCode,
        message: scheduledAt ? 'SMS scheduled successfully' : 'SMS sent successfully',
      });
    }

    return res.status(400).json({ success: false, errorCode: result.errorCode, error: result.error });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Send SMS error:', error);
    return res.status(500).json({ message: 'Failed to send SMS' });
  }
};

// ─── Send bulk SMS (different messages per recipient) ────────

const bulkSmsSchema = z.object({
  recipients: z
    .array(
      z.object({
        phone: z.string().min(5),
        message: z.string().min(1).max(1600),
      }),
    )
    .min(1, 'At least one recipient is required')
    .max(1000, 'Maximum 1000 recipients per batch'),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});

export const sendBulkSms = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { recipients, scheduledAt } = bulkSmsSchema.parse(req.body);

    const result = await smsService.sendBulk(recipients, {
      source: 'sms_bulk_api',
      sentById: userId,
      scheduledAt,
    });

    return res.json({
      success: true,
      total: result.total,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Bulk SMS error:', error);
    return res.status(500).json({ message: 'Failed to send bulk SMS' });
  }
};

// ─── Broadcast same message to multiple numbers ──────────────

const broadcastSmsSchema = z.object({
  phones: z.array(z.string().min(5)).min(1).max(1000),
  message: z.string().min(1).max(1600),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});

export const broadcastSms = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { phones, message, scheduledAt } = broadcastSmsSchema.parse(req.body);

    const recipients = phones.map((phone) => ({ phone, message }));
    const result = await smsService.sendBulk(recipients, {
      source: 'sms_broadcast_api',
      sentById: userId,
      scheduledAt,
    });

    return res.json({
      success: true,
      total: result.total,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Broadcast SMS error:', error);
    return res.status(500).json({ message: 'Failed to broadcast SMS' });
  }
};

// ─── Check SMS balance (mShastra) ───────────────────────────

export const checkSmsBalance = async (_req: Request, res: Response) => {
  try {
    const result = await smsService.checkMshastraBalance();
    if (result.success) {
      return res.json({ success: true, balance: result.balance });
    }
    return res.status(400).json({ success: false, error: result.error });
  } catch (error: any) {
    console.error('Check balance error:', error);
    return res.status(500).json({ message: 'Failed to check SMS balance' });
  }
};
