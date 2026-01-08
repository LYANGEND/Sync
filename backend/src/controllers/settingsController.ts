import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, handleControllerError } from '../utils/tenantContext';

const prisma = new PrismaClient();

const updateSettingsSchema = z.object({
  name: z.string().min(2).optional(),
  schoolName: z.string().min(2).optional(), // alias for name
  schoolAddress: z.string().optional(), // alias for address
  schoolPhone: z.string().optional(), // alias for phone
  schoolEmail: z.string().email().optional().or(z.literal('')), // alias for email
  schoolWebsite: z.string().url().optional().or(z.literal('')), // alias for website
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  currentTermId: z.string().uuid().optional().nullable(),

  // Theme
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
  secondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
  accentColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
  logoUrl: z.string().optional(),

  // Feature Toggles
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  chatEnabled: z.boolean().optional(),
  onlineAssessmentsEnabled: z.boolean().optional(),
  parentPortalEnabled: z.boolean().optional(),

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

/**
 * Get tenant settings (replaces old SchoolSettings)
 */
export const getSettings = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        academicTerms: {
          where: { isActive: true },
          take: 1
        }
      }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Map to expected format for backward compatibility
    const settings = {
      id: tenant.id,
      schoolName: tenant.name,
      schoolAddress: tenant.address,
      schoolPhone: tenant.phone,
      schoolEmail: tenant.email,
      schoolWebsite: tenant.website,
      logoUrl: tenant.logoUrl,
      currentTermId: tenant.currentTermId,
      currentTerm: tenant.academicTerms[0] || null,

      // Theme
      primaryColor: tenant.primaryColor,
      secondaryColor: tenant.secondaryColor,
      accentColor: tenant.accentColor,

      // Feature flags (read-only for most users)
      emailEnabled: tenant.emailEnabled,
      smsEnabled: tenant.smsEnabled,
      chatEnabled: tenant.chatEnabled,
      onlineAssessmentsEnabled: tenant.onlineAssessmentsEnabled,
      parentPortalEnabled: tenant.parentPortalEnabled,
      reportCardsEnabled: tenant.reportCardsEnabled,
      attendanceEnabled: tenant.attendanceEnabled,
      feeManagementEnabled: tenant.feeManagementEnabled,
      timetableEnabled: tenant.timetableEnabled,
      syllabusEnabled: tenant.syllabusEnabled,

      // SMTP (masked for security)
      smtpHost: tenant.smtpHost,
      smtpPort: tenant.smtpPort,
      smtpSecure: tenant.smtpSecure,
      smtpUser: tenant.smtpUser,
      smtpPassword: tenant.smtpPassword ? '********' : null,
      smtpFromEmail: tenant.smtpFromEmail,
      smtpFromName: tenant.smtpFromName,

      // SMS (masked for security)
      smsProvider: tenant.smsProvider,
      smsApiKey: tenant.smsApiKey ? '********' : null,
      smsApiSecret: tenant.smsApiSecret ? '********' : null,
      smsSenderId: tenant.smsSenderId,

      // Subscription info
      tier: tenant.tier,
      status: tenant.status,
      maxStudents: tenant.maxStudents,
      maxTeachers: tenant.maxTeachers,
      maxUsers: tenant.maxUsers,
      currentStudentCount: tenant.currentStudentCount,
      currentTeacherCount: tenant.currentTeacherCount,
      currentUserCount: tenant.currentUserCount,
    };

    res.json(settings);
  } catch (error) {
    handleControllerError(res, error, 'getSettings');
  }
};

/**
 * Update tenant settings
 */
export const updateSettings = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const data = updateSettingsSchema.parse(req.body);

    // Map from frontend format to tenant model (handle both formats)
    const updateData: any = {};

    // Name - accept both 'name' and 'schoolName'
    if (data.schoolName !== undefined) updateData.name = data.schoolName;
    else if (data.name !== undefined) updateData.name = data.name;

    // Address - accept both 'address' and 'schoolAddress'
    if (data.schoolAddress !== undefined) updateData.address = data.schoolAddress;
    else if (data.address !== undefined) updateData.address = data.address;

    // Phone - accept both 'phone' and 'schoolPhone'
    if (data.schoolPhone !== undefined) updateData.phone = data.schoolPhone;
    else if (data.phone !== undefined) updateData.phone = data.phone;

    // Email - accept both 'email' and 'schoolEmail'
    if (data.schoolEmail !== undefined) updateData.email = data.schoolEmail;
    else if (data.email !== undefined) updateData.email = data.email;

    // Website - accept both 'website' and 'schoolWebsite'
    if (data.schoolWebsite !== undefined) updateData.website = data.schoolWebsite;
    else if (data.website !== undefined) updateData.website = data.website;

    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl;
    if (data.currentTermId !== undefined) updateData.currentTermId = data.currentTermId;
    if (data.primaryColor !== undefined) updateData.primaryColor = data.primaryColor;
    if (data.secondaryColor !== undefined) updateData.secondaryColor = data.secondaryColor;
    if (data.accentColor !== undefined) updateData.accentColor = data.accentColor;

    // SMTP settings - only update if provided and not masked
    if (data.smtpHost !== undefined) updateData.smtpHost = data.smtpHost || null;
    if (data.smtpPort !== undefined) updateData.smtpPort = data.smtpPort;
    if (data.smtpSecure !== undefined) updateData.smtpSecure = data.smtpSecure;
    if (data.smtpUser !== undefined) updateData.smtpUser = data.smtpUser || null;
    if (data.smtpPassword !== undefined && data.smtpPassword !== '********') {
      updateData.smtpPassword = data.smtpPassword || null;
    }
    if (data.smtpFromEmail !== undefined) updateData.smtpFromEmail = data.smtpFromEmail || null;
    if (data.smtpFromName !== undefined) updateData.smtpFromName = data.smtpFromName || null;

    // SMS settings
    if (data.smsProvider !== undefined) updateData.smsProvider = data.smsProvider || null;
    if (data.smsApiKey !== undefined && data.smsApiKey !== '********') {
      updateData.smsApiKey = data.smsApiKey || null;
    }
    if (data.smsApiSecret !== undefined && data.smsApiSecret !== '********') {
      updateData.smsApiSecret = data.smsApiSecret || null;
    }
    if (data.smsSenderId !== undefined) updateData.smsSenderId = data.smsSenderId || null;

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    res.json({
      id: tenant.id,
      schoolName: tenant.name,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    handleControllerError(res, error, 'updateSettings');
  }
};

/**
 * Get public settings for a tenant (by slug or from authenticated user's tenant)
 */
export const getPublicSettings = async (req: Request, res: Response) => {
  try {
    let tenantId: string | undefined;
    let slug = req.params.slug;

    // If no slug provided, try to get tenantId from authenticated user's JWT
    if (!slug) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
          tenantId = decoded.tenantId;
        } catch {
          // Token invalid or expired, continue without tenantId
        }
      }
    }

    // Build query based on what we have
    let tenant;
    if (tenantId) {
      tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
          status: true,
        }
      });
    } else if (slug && slug !== 'default') {
      tenant = await prisma.tenant.findFirst({
        where: {
          OR: [
            { slug },
            { id: slug }
          ]
        },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
          status: true,
        }
      });
    }

    if (!tenant) {
      return res.json({
        schoolName: 'Sync School Management',
        name: 'Sync School Management',
        primaryColor: '#2563eb',
        secondaryColor: '#475569',
        accentColor: '#f59e0b',
      });
    }

    // Return with schoolName alias for frontend compatibility
    res.json({
      ...tenant,
      schoolName: tenant.name,
    });
  } catch (error) {
    handleControllerError(res, error, 'getPublicSettings');
  }
};

/**
 * Get tenant usage stats (for admin dashboard)
 */
export const getUsageStats = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        tier: true,
        status: true,
        maxStudents: true,
        maxTeachers: true,
        maxUsers: true,
        maxClasses: true,
        maxStorageGB: true,
        currentStudentCount: true,
        currentTeacherCount: true,
        currentUserCount: true,
        currentStorageUsedMB: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
      }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Calculate actual counts for verification
    const [studentCount, userCount, teacherCount, classCount] = await Promise.all([
      prisma.student.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.user.count({ where: { tenantId, isActive: true } }),
      prisma.user.count({ where: { tenantId, role: 'TEACHER', isActive: true } }),
      prisma.class.count({ where: { tenantId } }),
    ]);

    res.json({
      tier: tenant.tier,
      status: tenant.status,
      limits: {
        students: tenant.maxStudents,
        teachers: tenant.maxTeachers,
        users: tenant.maxUsers,
        classes: tenant.maxClasses,
        storageGB: tenant.maxStorageGB,
      },
      usage: {
        students: studentCount,
        teachers: teacherCount,
        users: userCount,
        classes: classCount,
        storageMB: tenant.currentStorageUsedMB,
      },
      percentages: {
        students: tenant.maxStudents === -1 ? 0 : Math.round((studentCount / tenant.maxStudents) * 100),
        teachers: tenant.maxTeachers === -1 ? 0 : Math.round((teacherCount / tenant.maxTeachers) * 100),
        users: tenant.maxUsers === -1 ? 0 : Math.round((userCount / tenant.maxUsers) * 100),
      },
      trialEndsAt: tenant.trialEndsAt,
      subscriptionEndsAt: tenant.subscriptionEndsAt,
    });
  } catch (error) {
    handleControllerError(res, error, 'getUsageStats');
  }
};
