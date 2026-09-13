import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';

export const normalizeClassName = (className: string): string =>
  className.trim().replace(/\s+/g, ' ');

export const classIdentityKey = (className: string, branchId?: string | null): string =>
  `${branchId || 'GLOBAL'}:${normalizeClassName(className).toLocaleLowerCase('en-US')}`;

export const deriveGradeLevelFromClassName = (className: string): number => {
  const normalizedName = normalizeClassName(className).toLowerCase();
  if (normalizedName.includes('baby')) return -2;
  if (normalizedName.includes('middle')) return -1;
  if (normalizedName.includes('day care') || normalizedName.includes('reception')) return 0;

  const gradeMatch = normalizedName.match(/grade\s+(\w+)/i);
  if (!gradeMatch) return 0;

  const gradeNumbers: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    '1': 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    '11': 11,
    '12': 12,
  };

  return gradeNumbers[gradeMatch[1].toLowerCase()] || 0;
};

const isUniqueConstraintError = (error: unknown): boolean =>
  (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
  || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002');

const findClassByIdentity = async (
  className: string,
  academicTermId: string,
  branchId?: string | null,
): Promise<{ id: string } | null> => prisma.class.findFirst({
  where: {
    academicTermId,
    branchId: branchId || null,
    name: {
      equals: normalizeClassName(className),
      mode: 'insensitive',
    },
  },
  select: { id: true },
});

/**
 * Resolves a class identity or creates it once. The database unique indexes are
 * the final concurrency guard; a P2002 is retried as a read after the winner commits.
 */
export const ensureClassExistsForTerm = async (
  className: string,
  academicTermId: string,
  defaultTeacherId: string,
  branchId?: string | null,
): Promise<string> => {
  const normalizedName = normalizeClassName(className);
  const existing = await findClassByIdentity(normalizedName, academicTermId, branchId);
  if (existing) return existing.id;

  try {
    const created = await prisma.class.create({
      data: {
        name: normalizedName,
        gradeLevel: deriveGradeLevelFromClassName(normalizedName),
        teacherId: defaultTeacherId,
        academicTermId,
        branchId: branchId || null,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await findClassByIdentity(normalizedName, academicTermId, branchId);
      if (raced) return raced.id;
    }
    throw error;
  }
};
