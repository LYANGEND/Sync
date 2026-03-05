import api from '../utils/api';

// Analytics Dashboard - matches backend getAnalyticsDashboard response
export interface AnalyticsDashboard {
  enrollment: {
    byStatus: { status: string; count: number }[];
    byGrade: { className: string; gradeLevel: number; students: number }[];
    total: number;
  };
  revenue: {
    weeklyTrend: { week: string; amount: number }[];
    totalRevenue: number;
    transactionCount: number;
  };
  attendance: {
    rate: number;
    present: number;
    late: number;
    absent: number;
    total: number;
  };
  academic: {
    averageScore: number;
    passRate: number;
    subjectPerformance: { subject: string; average: number; passRate: number; totalStudents: number }[];
  };
  risk: {
    byLevel: { level: string; count: number }[];
    total: number;
  };
  generatedAt: string;
}

export interface RevenueAnalytics {
  chartData: { date: string; amount: number; count: number }[];
  methodDistribution: { method: string; amount: number; percentage: number }[];
  summary: {
    totalCollected: number;
    totalTransactions: number;
    averagePayment: number;
  };
}

export interface AttendanceAnalytics {
  overallRate: number;
  byClass: { classId: string; className: string; attendanceRate: number; totalRecords: number }[];
  dailyTrend: { date: string; rate: number }[];
  alertsCount: number;
  totalStudentsTracked: number;
}

export interface SchoolHealth {
  metrics: {
    activeStudents: number;
    activeTeachers: number;
    totalClasses: number;
    studentTeacherRatio: number;
    feeCollectionRate: number;
    weeklyAttendanceRate: number;
    atRiskStudents: number;
    currentTerm: string;
  };
  insights: string[];
}

const analyticsService = {
  getDashboard: (period?: number) =>
    api.get<AnalyticsDashboard>('/analytics/dashboard', { params: { period } }).then(r => r.data),

  getRevenue: (params?: { startDate?: string; endDate?: string; groupBy?: string }) =>
    api.get<RevenueAnalytics>('/analytics/revenue', { params }).then(r => r.data),

  getAttendance: () =>
    api.get<AttendanceAnalytics>('/analytics/attendance').then(r => r.data),

  getSchoolHealth: () =>
    api.get<SchoolHealth>('/analytics/school-health').then(r => r.data),
};

export default analyticsService;
