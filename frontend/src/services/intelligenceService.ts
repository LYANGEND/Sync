import api from '../utils/api';

// Risk Assessment Types
export interface RiskAssessment {
  studentId: string;
  studentName: string;
  className: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskScore: number;
  factors: {
    academic: number;
    attendance: number;
    financial: number;
    trend: number;
  };
  details: {
    averageScore?: number;
    attendanceRate?: number;
    failingSubjects?: string[];
    feeBalance?: number;
    consecutiveAbsences?: number;
  };
}

export interface AttendanceAlert {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  alertType: string;
  message: string;
  resolved: boolean;
  createdAt: string;
  student?: { firstName: string; lastName: string; class?: { name: string } };
}

export interface ClassInsights {
  classId: string;
  className: string;
  overallRate: number;
  dayPatterns: { day: string; rate: number }[];
  chronicAbsentees: number;
  alerts: number;
}

export interface FeeAnalytics {
  totalExpected: number;
  totalCollected: number;
  collectionRate: number;
  overdue: number;
  overdueCount: number;
  byClass: { className: string; collected: number; outstanding: number; rate: number }[];
  atRiskAccounts: number;
}

export interface PaymentPrediction {
  studentId: string;
  studentName: string;
  predictedDate: string;
  likelihood: number;
  amount: number;
}

export interface PaymentPlan {
  id: string;
  studentId: string;
  studentName: string;
  totalAmount: number;
  installments: number;
  status: string;
  schedules: {
    id: string;
    dueDate: string;
    amount: number;
    paid: boolean;
    paidDate?: string;
  }[];
}

const intelligenceService = {
  // Risk Assessment - classId/termId as query params
  assessClass: (classId: string, termId: string) =>
    api.get('/intelligence/risk/class', { params: { classId, termId } }).then(r => r.data),

  assessStudent: (studentId: string, termId: string) =>
    api.get<RiskAssessment>(`/intelligence/risk/student/${studentId}`, { params: { termId } }).then(r => r.data),

  getAtRiskStudents: (params?: { termId?: string; minLevel?: string }) =>
    api.get<RiskAssessment[]>('/intelligence/risk/at-risk', { params }).then(r => r.data),

  getAIRecommendations: (studentId: string, termId: string) =>
    api.get<{ recommendations: string[] }>(`/intelligence/risk/student/${studentId}/recommendations`, { params: { termId } }).then(r => r.data),

  // Attendance Intelligence
  analyzeAttendance: (termId?: string) =>
    api.post('/intelligence/attendance/analyze', {}, { params: termId ? { termId } : undefined }).then(r => r.data),

  getClassInsights: (classId: string, startDate: string, endDate: string) =>
    api.get<ClassInsights>('/intelligence/attendance/insights', { params: { classId, startDate, endDate } }).then(r => r.data),

  getAttendanceAlerts: (params?: { resolved?: boolean; classId?: string; studentId?: string }) =>
    api.get<AttendanceAlert[]>('/intelligence/attendance/alerts', { params }).then(r => r.data),

  resolveAlert: (alertId: string, notes: string) =>
    api.put(`/intelligence/attendance/alerts/${alertId}/resolve`, { notes }).then(r => r.data),

  notifyParent: (alertId: string) =>
    api.post(`/intelligence/attendance/alerts/${alertId}/notify`).then(r => r.data),

  // Smart Fees
  getFeeAnalytics: (params?: { termId?: string }) =>
    api.get<FeeAnalytics>('/intelligence/fees/analytics', { params }).then(r => r.data),

  predictPayments: (classId?: string) =>
    api.get<PaymentPrediction[]>('/intelligence/fees/predictions', { params: { classId } }).then(r => r.data),

  createPaymentPlan: (data: { studentId: string; feeId: string; installments: number }) =>
    api.post<PaymentPlan>('/intelligence/fees/payment-plan', data).then(r => r.data),

  sendSmartReminders: () =>
    api.post('/intelligence/fees/smart-reminders').then(r => r.data),

  getFinancialAidCandidates: () =>
    api.get('/intelligence/fees/financial-aid').then(r => r.data),

  // Auto Grading
  gradeSubmission: (submissionId: string) =>
    api.post(`/intelligence/grading/auto-grade/${submissionId}`).then(r => r.data),

  getItemAnalysis: (assessmentId: string) =>
    api.get(`/intelligence/grading/item-analysis/${assessmentId}`).then(r => r.data),
};

export default intelligenceService;
