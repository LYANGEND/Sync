/**
 * Unified School Metrics Service
 * ==============================
 * Single source of truth for commonly-queried school KPIs.
 *
 * BEFORE: Outstanding fees computed in 5 controllers, attendance rate in 7,
 *         student risk count in 4, revenue trends in 3 — each with slightly
 *         different queries and thresholds.
 *
 * AFTER:  One canonical query per metric, optionally cached, consumed by all
 *         controllers and services.
 */

import { prisma } from '../utils/prisma';

// ------------------------------------------------------------------
// Simple in-memory TTL cache (avoids hammering DB for hot dashboards)
// ------------------------------------------------------------------
const cache = new Map<string, { data: any; expiresAt: number }>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return Promise.resolve(entry.data as T);
  return fn().then(data => {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  });
}

/** Bust a specific key (after writes) */
export function invalidate(key: string) {
  cache.delete(key);
}

// ------------------------------------------------------------------
// FEE COLLECTION
// ------------------------------------------------------------------
export interface FeeCollectionSummary {
  totalDue: number;
  totalPaid: number;
  outstanding: number;
  collectionRatePercent: number;
}

export function getFeeCollectionSummary(): Promise<FeeCollectionSummary> {
  return cached('fee-collection', 60_000, async () => {
    const [feesAgg, paidAgg] = await Promise.all([
      prisma.studentFeeStructure.aggregate({ _sum: { amountDue: true } }),
      prisma.payment.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true } }),
    ]);

    const totalDue = Number(feesAgg._sum.amountDue || 0);
    const totalPaid = Number(paidAgg._sum.amount || 0);
    const outstanding = Math.max(0, totalDue - totalPaid);
    const collectionRatePercent = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

    return { totalDue, totalPaid, outstanding, collectionRatePercent };
  });
}

// ------------------------------------------------------------------
// ATTENDANCE
// ------------------------------------------------------------------
export interface AttendanceSummary {
  totalRecords: number;
  present: number;
  late: number;
  absent: number;
  ratePercent: number; // (present + late) / total * 100
}

/**
 * Attendance for a time window. Defaults to the last 7 days.
 */
export function getAttendanceSummary(sinceDays = 7): Promise<AttendanceSummary> {
  return cached(`attendance-${sinceDays}`, 60_000, async () => {
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);

    const records = await prisma.attendance.findMany({
      where: { date: { gte: since } },
      select: { status: true },
    });

    const total = records.length;
    const present = records.filter(r => r.status === 'PRESENT').length;
    const late = records.filter(r => r.status === 'LATE').length;
    const absent = records.filter(r => r.status === 'ABSENT').length;
    const ratePercent = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return { totalRecords: total, present, late, absent, ratePercent };
  });
}

/**
 * Attendance for the current active term (used by analytics dashboards).
 */
export async function getTermAttendanceSummary(): Promise<AttendanceSummary & { termId?: string }> {
  const activeTerm = await prisma.academicTerm.findFirst({ where: { isActive: true } });
  if (!activeTerm) return { totalRecords: 0, present: 0, late: 0, absent: 0, ratePercent: 0 };

  return cached(`attendance-term-${activeTerm.id}`, 120_000, async () => {
    const records = await prisma.attendance.findMany({
      where: { date: { gte: activeTerm.startDate, lte: new Date() } },
      select: { status: true },
    });

    const total = records.length;
    const present = records.filter(r => r.status === 'PRESENT').length;
    const late = records.filter(r => r.status === 'LATE').length;
    const absent = records.filter(r => r.status === 'ABSENT').length;
    const ratePercent = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return { totalRecords: total, present, late, absent, ratePercent, termId: activeTerm.id };
  });
}

// ------------------------------------------------------------------
// STUDENT RISK
// ------------------------------------------------------------------
export interface RiskSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export function getRiskSummary(): Promise<RiskSummary> {
  return cached('risk-summary', 120_000, async () => {
    try {
      const groups = await (prisma as any).studentRiskAssessment.groupBy({
        by: ['riskLevel'],
        _count: true,
      });

      const byLevel: Record<string, number> = {};
      let total = 0;
      for (const g of groups) {
        byLevel[g.riskLevel] = g._count;
        total += g._count;
      }

      return {
        critical: byLevel['CRITICAL'] || 0,
        high: byLevel['HIGH'] || 0,
        medium: byLevel['MEDIUM'] || 0,
        low: byLevel['LOW'] || 0,
        total,
      };
    } catch {
      return { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
    }
  });
}

/** Convenience: count of HIGH + CRITICAL students */
export async function getAtRiskCount(): Promise<number> {
  const s = await getRiskSummary();
  return s.critical + s.high;
}

// ------------------------------------------------------------------
// ENROLLMENT
// ------------------------------------------------------------------
export interface EnrollmentSummary {
  activeStudents: number;
  activeTeachers: number;
  totalClasses: number;
  studentTeacherRatio: number;
}

export function getEnrollmentSummary(): Promise<EnrollmentSummary> {
  return cached('enrollment-summary', 120_000, async () => {
    const [activeStudents, activeTeachers, totalClasses] = await Promise.all([
      prisma.student.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'TEACHER', isActive: true } }),
      prisma.class.count(),
    ]);

    const studentTeacherRatio = activeTeachers > 0 ? Math.round(activeStudents / activeTeachers) : 0;
    return { activeStudents, activeTeachers, totalClasses, studentTeacherRatio };
  });
}

// ------------------------------------------------------------------
// REVENUE
// ------------------------------------------------------------------
export interface RevenueSummary {
  totalCollected: number;
  transactionCount: number;
  todayRevenue: number;
}

export function getRevenueSummary(): Promise<RevenueSummary> {
  return cached('revenue-summary', 60_000, async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalAgg, todayAgg] = await Promise.all([
      prisma.payment.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true }, _count: true }),
      prisma.payment.aggregate({ where: { status: 'COMPLETED', paymentDate: { gte: today } }, _sum: { amount: true } }),
    ]);

    return {
      totalCollected: Number(totalAgg._sum.amount || 0),
      transactionCount: totalAgg._count || 0,
      todayRevenue: Number(todayAgg._sum.amount || 0),
    };
  });
}

// ------------------------------------------------------------------
// ALERTS
// ------------------------------------------------------------------
export async function getUnresolvedAlertCount(): Promise<number> {
  try {
    return await (prisma as any).attendanceAlert.count({ where: { isResolved: false } });
  } catch {
    return 0;
  }
}

// ------------------------------------------------------------------
// COMPOSITE: "School Health" snapshot (used by multiple dashboards)
// ------------------------------------------------------------------
export interface SchoolHealthSnapshot {
  enrollment: EnrollmentSummary;
  fees: FeeCollectionSummary;
  attendance: AttendanceSummary;
  risk: RiskSummary;
  revenue: RevenueSummary;
  unresolvedAlerts: number;
}

export async function getSchoolHealthSnapshot(): Promise<SchoolHealthSnapshot> {
  const [enrollment, fees, attendance, risk, revenue, unresolvedAlerts] = await Promise.all([
    getEnrollmentSummary(),
    getFeeCollectionSummary(),
    getAttendanceSummary(7),
    getRiskSummary(),
    getRevenueSummary(),
    getUnresolvedAlertCount(),
  ]);

  return { enrollment, fees, attendance, risk, revenue, unresolvedAlerts };
}
