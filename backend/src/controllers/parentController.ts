import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { TenantRequest, getTenantId, getUserId } from '../utils/tenantContext';

const prisma = new PrismaClient() as any;

// Get parent's children
export const getParentChildren = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    // Get parent record
    const parent = await prisma.parent.findFirst({
      where: { userId, tenantId }
    });

    if (!parent) {
      return res.status(404).json({ error: 'Parent record not found' });
    }

    // Get children
    const children = await prisma.student.findMany({
      where: {
        tenantId,
        parentId: parent.id,
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: { firstName: 'asc' }
    });

    res.json({ children });
  } catch (error) {
    console.error('Get parent children error:', error);
    res.status(500).json({ error: 'Failed to fetch children' });
  }
};
