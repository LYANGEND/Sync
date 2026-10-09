import api from '../utils/api';

export interface GradingScale {
  id: string;
  grade: string;
  minScore: number;
  maxScore: number;
  remark?: string;
}

export interface TermResult {
  id: string;
  subjectId: string;
  subjectName: string;
  totalScore: number;
  grade: string;
  remarks?: string;
}

export interface StudentReport {
  id: string;
  studentId: string;
  termId: string;
  academicYear?: string;
  totalScore: number;
  averageScore: number;
  rank?: number;
  attendancePercentage?: number;
  status: 'DRAFT' | 'FINALIZED' | 'PUBLISHED';
  currentVersion: number;
  finalizedAt?: string | null;
  publishedAt?: string | null;
  totalAttendance?: number;
  totalDays?: number;
  classTeacherRemark?: string;
  principalRemark?: string;
  school?: {
    schoolName: string;
    schoolAddress?: string;
    schoolPhone?: string;
    schoolEmail?: string;
    logoUrl?: string;
  };
  results: TermResult[];
  student?: {
    firstName: string;
    lastName: string;
    admissionNumber: string;
  };
  class?: {
    name: string;
    gradeLevel: number;
  };
  term?: {
    name: string;
    startDate: string;
    endDate: string;
    status: 'DRAFT' | 'ACTIVE' | 'CLOSING' | 'CLOSED';
  };
}

export type ReportReadinessCode =
  | 'TERM_NOT_CLOSING'
  | 'PLACEMENT_MISSING'
  | 'CLASS_MISMATCH'
  | 'REPORT_NOT_GENERATED'
  | 'NO_REQUIRED_SUBJECTS'
  | 'SUBJECT_HAS_NO_ASSESSMENTS'
  | 'SUBJECT_WEIGHT_INCOMPLETE'
  | 'ASSESSMENT_RESULT_MISSING'
  | 'TERM_RESULT_MISSING'
  | 'TERM_RESULT_STALE'
  | 'GRADE_UNRESOLVED'
  | 'NO_INSTRUCTIONAL_DAYS'
  | 'NO_ELIGIBLE_INSTRUCTIONAL_DAYS'
  | 'ATTENDANCE_MISSING'
  | 'DUPLICATE_ATTENDANCE'
  | 'NO_STUDENTS_ENROLLED';

export interface ReportReadinessBlocker {
  code: ReportReadinessCode;
  message: string;
  studentId?: string;
  subjectId?: string;
  assessmentId?: string;
  dates?: string[];
}

export interface StudentReportReadiness {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  termId: string;
  classId: string | null;
  className: string | null;
  reportId: string | null;
  reportStatus: StudentReport['status'] | 'NOT_GENERATED';
  ready: boolean;
  blockers: ReportReadinessBlocker[];
  metrics: {
    requiredSubjects: number;
    assessments: number;
    recordedResults: number;
    instructionalDays: number;
    attendanceDays: number;
  };
}

export interface ClassReportReadiness {
  termId: string;
  classId: string;
  className: string;
  ready: boolean;
  checkedAt: string;
  counts: {
    students: number;
    ready: number;
    blocked: number;
    instructionalDays: number;
  };
  blockers: ReportReadinessBlocker[];
  students: StudentReportReadiness[];
}

export interface ReportVersion {
  id: string;
  reportId: string;
  version: number;
  status: 'FINALIZED' | 'PUBLISHED';
  reason?: string | null;
  createdByUserId: string;
  createdAt: string;
}

export interface ClosedTermAmendment {
  id: string;
  academicTermId: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'APPLIED';
  reason: string;
  requestedByUserId: string;
  requestedAt: string;
  approvedByUserId?: string | null;
  appliedByUserId?: string | null;
  items: Array<{
    id: string;
    entityType: 'TERM_RESULT' | 'STUDENT_TERM_REPORT';
    entityId: string;
    fieldName?: string | null;
    beforeValue: unknown;
    afterValue: unknown;
  }>;
}

export const reportCardService = {
  // Grading Scales
  getGradingScales: async () => {
    const response = await api.get<GradingScale[]>('/reports/grading-scales');
    return response.data;
  },

  createGradingScale: async (data: Omit<GradingScale, 'id'>) => {
    const response = await api.post<GradingScale>('/reports/grading-scales', data);
    return response.data;
  },

  updateGradingScale: async (id: string, data: Partial<GradingScale>) => {
    const response = await api.put<GradingScale>(`/reports/grading-scales/${id}`, data);
    return response.data;
  },

  deleteGradingScale: async (id: string) => {
    const response = await api.delete(`/reports/grading-scales/${id}`);
    return response.data;
  },

  // Reports
  generateStudentReport: async (studentId: string, termId: string) => {
    const response = await api.post<StudentReport>('/reports/generate', { studentId, termId });
    return response.data;
  },

  generateClassReports: async (classId: string, termId: string) => {
    const response = await api.post<{ count: number }>('/reports/generate-bulk', { classId, termId });
    return response.data;
  },

  getStudentReport: async (studentId: string, termId: string) => {
    const response = await api.get<StudentReport>('/reports/student', { params: { studentId, termId } });
    return response.data;
  },

  getClassReports: async (classId: string, termId: string) => {
    const response = await api.get<StudentReport[]>('/reports/class', { params: { classId, termId } });
    return response.data;
  },

  updateReportRemarks: async (studentId: string, termId: string, remarks: { classTeacherRemark?: string, principalRemark?: string }) => {
    const response = await api.put<StudentReport>('/reports/remarks', { studentId, termId, ...remarks });
    return response.data;
  },

  getStudentReadiness: async (studentId: string, termId: string) => {
    const response = await api.get<StudentReportReadiness>('/reports/readiness/student', { params: { studentId, termId } });
    return response.data;
  },

  getClassReadiness: async (classId: string, termId: string) => {
    const response = await api.get<ClassReportReadiness>('/reports/readiness/class', { params: { classId, termId } });
    return response.data;
  },

  finalizeStudentReport: async (studentId: string, termId: string) => {
    const response = await api.post('/reports/finalize', { studentId, termId });
    return response.data;
  },

  publishStudentReport: async (studentId: string, termId: string) => {
    const response = await api.post('/reports/publish', { studentId, termId });
    return response.data;
  },

  finalizeClassReports: async (classId: string, termId: string) => {
    const response = await api.post('/reports/finalize-bulk', { classId, termId });
    return response.data as { total: number; changed: number; unchanged: number };
  },

  publishClassReports: async (classId: string, termId: string) => {
    const response = await api.post('/reports/publish-bulk', { classId, termId });
    return response.data as { total: number; changed: number; unchanged: number };
  },

  getReportVersions: async (reportId: string) => {
    const response = await api.get<ReportVersion[]>(`/reports/${reportId}/versions`);
    return response.data;
  },

  getAmendments: async (termId: string) => {
    const response = await api.get<ClosedTermAmendment[]>('/reports/amendments', { params: { termId } });
    return response.data;
  },

  requestAmendment: async (data: {
    termId: string;
    reason: string;
    items: Array<{
      entityType: 'TERM_RESULT' | 'STUDENT_TERM_REPORT';
      entityId: string;
      fieldName: string;
      afterValue: string | number | null;
    }>;
  }) => {
    const response = await api.post<ClosedTermAmendment>('/reports/amendments', data);
    return response.data;
  },

  approveAmendment: async (id: string) => (await api.post(`/reports/amendments/${id}/approve`)).data,
  rejectAmendment: async (id: string) => (await api.post(`/reports/amendments/${id}/reject`)).data,
  applyAmendment: async (id: string) => (await api.post(`/reports/amendments/${id}/apply`)).data,
};
