/**
 * Term Helper Utilities
 * 
 * Helper functions for term-based operations
 */

import { prisma } from './prisma';
import { getActiveTerm } from '../services/termLifecycleService';

/**
 * Get the active term or find the term that contains the given date
 */
export async function getTermForDate(date: Date = new Date()): Promise<string | null> {
  // First, try to get the active term
  const activeTerm = await getActiveTerm();

  if (activeTerm) {
    return activeTerm.id;
  }

  // If no active term, find the term that contains this date
  const term = await prisma.academicTerm.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date }
    },
    orderBy: { startDate: 'desc' }
  });

  if (term) {
    return term.id;
  }

  // If no term contains this date, find the nearest term
  const nearestTerm = await findNearestTerm(date);
  return nearestTerm?.id || null;
}

/**
 * Find the nearest term to a given date
 */
async function findNearestTerm(date: Date) {
  const allTerms = await prisma.academicTerm.findMany({
    orderBy: { startDate: 'asc' }
  });

  if (allTerms.length === 0) return null;

  let nearest = allTerms[0];
  let minDiff = Math.abs(date.getTime() - allTerms[0].startDate.getTime());

  for (const term of allTerms) {
    const diff = Math.abs(date.getTime() - term.startDate.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      nearest = term;
    }
  }

  return nearest;
}

/**
 * Get the current active term
 */
export async function getCurrentTerm() {
  return getActiveTerm();
}

/**
 * Resolve a caller-provided term for a write. Unlike getTermForDate, this
 * function never falls back to the active, containing, or nearest term.
 */
export async function requireExplicitTerm(termId: string) {
  if (!termId) {
    throw new Error('An explicit academic term is required');
  }

  const term = await prisma.academicTerm.findUnique({ where: { id: termId } });
  if (!term) {
    throw new Error('Academic term not found');
  }

  return term;
}

/**
 * Get all terms for a given academic year
 */
export async function getTermsForYear(year: number) {
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31);

  return await prisma.academicTerm.findMany({
    where: {
      startDate: {
        gte: startOfYear,
        lte: endOfYear
      }
    },
    orderBy: { startDate: 'asc' }
  });
}

export default {
  getTermForDate,
  getCurrentTerm,
  requireExplicitTerm,
  getTermsForYear
};
