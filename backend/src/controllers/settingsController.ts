import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const updateSettingsSchema = z.object({
  schoolName: z.string().min(2),
  schoolAddress: z.string().optional(),
  schoolPhone: z.string().optional(),
  schoolEmail: z.string().email().optional().or(z.literal('')),
  schoolWebsite: z.string().url().optional().or(z.literal('')),
  currentTermId: z.string().uuid().optional().nullable(),

  // Theme
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
  secondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
  accentColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),

  // Notification Channel Toggles
  emailNotificationsEnabled: z.boolean().optional(),
  smsNotificationsEnabled: z.boolean().optional(),

  // Fee Reminder Settings
  feeReminderEnabled: z.boolean().optional(),
  feeReminderDaysBefore: z.number().min(1).max(30).optional(),
  overdueReminderEnabled: z.boolean().optional(),
  overdueReminderFrequency: z.number().min(1).max(30).optional(),

  // SMTP
  smtpHost: z.string().optional().or(z.literal('')),
  smtpPort: z.number().optional().nullable(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().optional().or(z.literal('')),
  smtpPassword: z.string().optional().or(z.literal('')),
  smtpFromEmail: z.string().email().optional().or(z.literal('')),
  smtpFromName: z.string().optional().or(z.literal('')),

  // SMS
  smsProvider: z.string().optional().or(z.literal('')),
  smsApiKey: z.string().optional().or(z.literal('')),
  smsApiSecret: z.string().optional().or(z.literal('')),
  smsSenderId: z.string().optional().or(z.literal('')),
});

export const getSettings = async (req: Request, res: Response) => {
  try {
    let settings = await prisma.schoolSettings.findFirst({
      include: {
        currentTerm: true
      }
    });

    if (!settings) {
      settings = await prisma.schoolSettings.create({
        data: {
          schoolName: 'My School',
        },
        include: {
          currentTerm: true
        }
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const data = updateSettingsSchema.parse(req.body);

    const existing = await prisma.schoolSettings.findFirst();

    let settings;
    if (existing) {
      settings = await prisma.schoolSettings.update({
        where: { id: existing.id },
        data,
      });
    } else {
      settings = await prisma.schoolSettings.create({
        data,
      });
    }

    res.json(settings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Update settings error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getPublicSettings = async (req: Request, res: Response) => {
  try {
    const settings = await prisma.schoolSettings.findFirst({
      select: {
        schoolName: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
      }
    });

    if (!settings) {
      return res.json({
        schoolName: 'My School',
        primaryColor: '#2563eb',
        secondaryColor: '#475569',
        accentColor: '#f59e0b',
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('Get public settings error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const uploadLogo = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const logoUrl = `/uploads/logos/${req.file.filename}`;

    const existing = await prisma.schoolSettings.findFirst();

    let settings;
    if (existing) {
      settings = await prisma.schoolSettings.update({
        where: { id: existing.id },
        data: { logoUrl },
      });
    } else {
      settings = await prisma.schoolSettings.create({
        data: {
          schoolName: 'My School',
          logoUrl
        },
      });
    }

    res.json({ logoUrl, message: 'Logo uploaded successfully' });
  } catch (error) {
    console.error('Upload logo error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteLogo = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.schoolSettings.findFirst();

    if (existing && existing.logoUrl) {
      // Update settings to remove logo URL
      await prisma.schoolSettings.update({
        where: { id: existing.id },
        data: { logoUrl: null },
      });

      // Optionally delete the file from disk
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '../../', existing.logoUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({ message: 'Logo deleted successfully' });
  } catch (error) {
    console.error('Delete logo error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
