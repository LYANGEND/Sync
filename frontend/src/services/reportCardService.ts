import api from '../utils/api';

export interface GradingScale {
  id: string;
  grade: string;
  minScore: number;
  maxScore: number;
  gpaPoint: number;
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
  academicYear: string;
  totalScore: number;
  averageScore: number;
  rank?: number;
  attendancePercentage: number;
  classTeacherRemark?: string;
  principalRemark?: string;
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
  };
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
  }
};
