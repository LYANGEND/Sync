import { prisma } from '../utils/prisma';

export type StudentMatchStrength = 'LIKELY_SAME' | 'LIKELY_SIBLING' | 'POSSIBLE';

export interface StudentMatchCandidate {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date | string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
}

export interface StudentMatchRecord {
  id: string | null;
  firstName: string;
  lastName: string;
  admissionNumber: string | null;
  dateOfBirth: Date | string | null;
  status: string;
  className: string | null;
  branchName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
}

export interface StudentMatch {
  strength: StudentMatchStrength;
  reasons: string[];
  student: StudentMatchRecord;
}

interface PoolEntry {
  record: StudentMatchRecord;
  first: string;
  last: string;
  dob: string;
  phone: string;
  emails: string[];
  guardianNames: string[];
}

const MAX_MATCHES = 5;
const STRENGTH_RANK: Record<StudentMatchStrength, number> = { LIKELY_SAME: 0, LIKELY_SIBLING: 1, POSSIBLE: 2 };

const normalizeName = (value?: string | null): string => (value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z\s'-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Compares local numbers regardless of format: 0977123456, 977123456 and +260977123456 all match.
const normalizePhone = (value?: string | null): string => {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : '';
};

const normalizeEmail = (value?: string | null): string => (value ?? '').trim().toLowerCase();

const toDateKey = (value?: Date | string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const sortedTokens = (value: string): string => value.split(' ').sort().join(' ');

const editDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
};

// Tolerates one typo in names of 5+ letters (e.g. "Chileshe" vs "Chilesh").
const similarWord = (a: string, b: string): boolean => (
  a === b || (Math.min(a.length, b.length) >= 5 && editDistance(a, b) <= 1)
);

const compareChildNames = (candidate: PoolEntry, existing: PoolEntry): 'EXACT' | 'SIMILAR' | null => {
  const { first, last } = candidate;
  if (!first || !last || !existing.first || !existing.last) return null;
  if ((first === existing.first && last === existing.last) || (first === existing.last && last === existing.first)) {
    return 'EXACT';
  }
  const similarOrder = similarWord(first, existing.first) && similarWord(last, existing.last);
  const similarSwapped = similarWord(first, existing.last) && similarWord(last, existing.first);
  return similarOrder || similarSwapped ? 'SIMILAR' : null;
};

const toPoolEntry = (
  record: StudentMatchRecord,
  extraEmails: (string | null | undefined)[] = [],
  extraGuardianNames: (string | null | undefined)[] = [],
): PoolEntry => ({
  record,
  first: normalizeName(record.firstName),
  last: normalizeName(record.lastName),
  dob: toDateKey(record.dateOfBirth),
  phone: normalizePhone(record.guardianPhone),
  emails: [record.guardianEmail, ...extraEmails].map(normalizeEmail).filter(Boolean),
  guardianNames: [record.guardianName, ...extraGuardianNames].map(normalizeName).filter(Boolean).map(sortedTokens),
});

export const candidateToRecord = (candidate: StudentMatchCandidate, label: string | null): StudentMatchRecord => ({
  id: null,
  firstName: candidate.firstName,
  lastName: candidate.lastName,
  admissionNumber: label,
  dateOfBirth: candidate.dateOfBirth ?? null,
  status: 'PENDING_IMPORT',
  className: null,
  branchName: null,
  guardianName: candidate.guardianName ?? null,
  guardianPhone: candidate.guardianPhone ?? null,
  guardianEmail: candidate.guardianEmail ?? null,
});

export class StudentMatchPool {
  constructor(private readonly entries: PoolEntry[] = []) {}

  add(record: StudentMatchRecord): void {
    this.entries.push(toPoolEntry(record));
  }

  match(candidate: StudentMatchCandidate): StudentMatch[] {
    const target = toPoolEntry(candidateToRecord(candidate, null));
    const guardianName = target.guardianNames[0] ?? '';
    const email = target.emails[0] ?? '';
    const matches: StudentMatch[] = [];

    for (const entry of this.entries) {
      const nameMatch = compareChildNames(target, entry);
      const sameDob = Boolean(target.dob) && entry.dob === target.dob;
      const samePhone = Boolean(target.phone) && entry.phone === target.phone;
      const sameEmail = Boolean(email) && entry.emails.includes(email);
      const sameGuardian = Boolean(guardianName) && entry.guardianNames.includes(guardianName);
      const sameSurname = Boolean(target.last) && Boolean(entry.last) && similarWord(target.last, entry.last);
      const guardianContactMatch = samePhone || sameEmail;

      let strength: StudentMatchStrength | null = null;
      if (nameMatch && (sameDob || guardianContactMatch || sameGuardian)) {
        strength = 'LIKELY_SAME';
      } else if (guardianContactMatch || (sameGuardian && sameSurname)) {
        strength = 'LIKELY_SIBLING';
      } else if (nameMatch === 'EXACT' || sameGuardian) {
        strength = 'POSSIBLE';
      }
      if (!strength) continue;

      const reasons: string[] = [];
      if (nameMatch === 'EXACT') reasons.push('Same name');
      if (nameMatch === 'SIMILAR') reasons.push('Similar name');
      if (sameDob) reasons.push('Same date of birth');
      if (samePhone) reasons.push('Same guardian phone');
      if (sameEmail) reasons.push('Same guardian email');
      if (sameGuardian) reasons.push('Same guardian name');

      matches.push({ strength, reasons, student: entry.record });
    }

    return matches
      .sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength] || b.reasons.length - a.reasons.length)
      .slice(0, MAX_MATCHES);
  }
}

// Includes archived and withdrawn students so returning learners are found instead of duplicated.
export const loadStudentMatchPool = async (
  options: { branchId?: string | null; excludeStudentId?: string } = {},
): Promise<StudentMatchPool> => {
  const students = await prisma.student.findMany({
    where: {
      ...(options.branchId ? { branchId: options.branchId } : {}),
      ...(options.excludeStudentId ? { id: { not: options.excludeStudentId } } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
      dateOfBirth: true,
      status: true,
      guardianName: true,
      guardianPhone: true,
      guardianEmail: true,
      class: { select: { name: true } },
      branch: { select: { name: true } },
      parent: { select: { email: true, fullName: true } },
    },
  });

  return new StudentMatchPool(students.map(student => toPoolEntry(
    {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
      dateOfBirth: student.dateOfBirth,
      status: student.status,
      className: student.class?.name ?? null,
      branchName: student.branch?.name ?? null,
      guardianName: student.guardianName ?? student.parent?.fullName ?? null,
      guardianPhone: student.guardianPhone,
      guardianEmail: student.guardianEmail ?? student.parent?.email ?? null,
    },
    [student.parent?.email],
    [student.parent?.fullName],
  )));
};

export const hasLikelySameStudent = (matches: StudentMatch[]): boolean => (
  matches.some(match => match.strength === 'LIKELY_SAME')
);
