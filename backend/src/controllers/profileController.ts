import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const prisma = new PrismaClient();

export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const tenantId = (req as any).user?.tenantId;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        profilePictureUrl: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get tenant subscription info for feature gating
    let subscription = null;
    if (tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          tier: true,
          status: true,
          aiLessonPlanEnabled: true,
          aiTutorEnabled: true,
          aiAnalyticsEnabled: true,
          aiReportCardsEnabled: true,
          aiAssessmentsEnabled: true,
        }
      });
      if (tenant) {
        subscription = {
          tier: tenant.tier,
          status: tenant.status,
          features: {
            aiLessonPlanEnabled: tenant.aiLessonPlanEnabled,
            aiTutorEnabled: tenant.aiTutorEnabled,
            aiAnalyticsEnabled: tenant.aiAnalyticsEnabled,
            aiReportCardsEnabled: tenant.aiReportCardsEnabled,
            aiAssessmentsEnabled: tenant.aiAssessmentsEnabled,
          }
        };
      }
    }

    res.json({ ...user, subscription });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
};

export const updateProfilePicture = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // In a real app, you'd upload to S3/Cloudinary here and get a URL.
    // For local dev, we'll serve from the static uploads folder.
    const fileUrl = `/uploads/profiles/${req.file.filename}`;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { profilePictureUrl: fileUrl },
      select: { profilePictureUrl: true }
    });

    res.json({ message: 'Profile picture updated', profilePictureUrl: user.profilePictureUrl });
  } catch (error) {
    console.error('Update profile picture error:', error);
    res.status(500).json({ message: 'Failed to update profile picture' });
  }
};

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ message: 'Invalid current password' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedPassword }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to change password' });
  }
};
