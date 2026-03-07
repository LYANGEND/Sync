import api from '../utils/api';

// ==========================================
// TYPES
// ==========================================

export interface SubTopic {
  id: string;
  title: string;
  description: string | null;
  learningObjectives: string | null; // JSON string of string[]
  topicId: string;
  orderIndex: number;
  duration: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: string;
  title: string;
  description: string | null;
  subjectId: string;
  gradeLevel: number;
  orderIndex: number;
  subtopics?: SubTopic[];
  _count?: { subtopics: number };
  // Progress fields (when fetched via progress endpoint)
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  completedAt?: string | null;
}

export interface GeneratedLessonPlan {
  lessonPlan: string;
  topic: { id: string; title: string };
  subtopics: { id: string; title: string }[];
  subjectName: string;
  gradeLevel: number;
  duration: number;
}

export interface NextTopicSuggestion {
  nextTopic: Topic | null;
  progress: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    percentage: number;
  };
}

export interface GradeStats {
  gradeLevel: number;
  topicCount: number;
  subtopicCount: number;
}

export interface SubjectSyllabusOverview {
  id: string;
  name: string;
  code: string;
  totalTopics: number;
  totalSubTopics: number;
  gradeLevels: number[];
  byGrade: GradeStats[];
}

// ==========================================
// API METHODS
// ==========================================

const syllabusService = {
  // --- Overview ---
  getOverview() {
    return api.get<SubjectSyllabusOverview[]>('/syllabus/overview');
  },

  // --- Topics ---
  getTopics(subjectId: string, gradeLevel: number) {
    return api.get<Topic[]>('/syllabus/topics', { params: { subjectId, gradeLevel } });
  },

  createTopic(data: { title: string; description?: string; subjectId: string; gradeLevel: number; orderIndex?: number }) {
    return api.post<Topic>('/syllabus/topics', data);
  },

  updateTopic(id: string, data: Partial<{ title: string; description: string; orderIndex: number }>) {
    return api.put<Topic>(`/syllabus/topics/${id}`, data);
  },

  deleteTopic(id: string) {
    return api.delete(`/syllabus/topics/${id}`);
  },

  // --- SubTopics ---
  getSubTopics(topicId: string) {
    return api.get<SubTopic[]>('/syllabus/subtopics', { params: { topicId } });
  },

  createSubTopic(data: { title: string; description?: string; learningObjectives?: string[]; topicId: string; orderIndex?: number; duration?: number }) {
    return api.post<SubTopic>('/syllabus/subtopics', data);
  },

  updateSubTopic(id: string, data: Partial<{ title: string; description: string; learningObjectives: string[]; orderIndex: number; duration: number }>) {
    return api.put<SubTopic>(`/syllabus/subtopics/${id}`, data);
  },

  deleteSubTopic(id: string) {
    return api.delete(`/syllabus/subtopics/${id}`);
  },

  // --- Progress ---
  getClassProgress(classId: string, subjectId: string) {
    return api.get<Topic[]>('/syllabus/progress', { params: { classId, subjectId } });
  },

  updateTopicProgress(topicId: string, classId: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED') {
    return api.put(`/syllabus/progress/${topicId}/${classId}`, { status });
  },

  // --- AI Lesson Plan Generation ---
  generateLessonPlan(data: { topicId: string; subTopicIds?: string[]; subjectId?: string; gradeLevel?: number; durationMinutes?: number }) {
    return api.post<GeneratedLessonPlan>('/syllabus/generate-lesson-plan', data);
  },

  // --- AI Syllabus Generation ---
  generateSyllabus(data: { subjectId: string; gradeLevel: number }) {
    return api.post<{ message: string; topics: Topic[]; subject: string; gradeLevel: number }>('/syllabus/generate-syllabus', data);
  },

  // --- Next Topic Suggestion ---
  getNextTopic(classId: string, subjectId: string) {
    return api.get<NextTopicSuggestion>('/syllabus/next-topic', { params: { classId, subjectId } });
  },
};

// Helper to parse learningObjectives from JSON string
export function parseLearningObjectives(objectives: string | null): string[] {
  if (!objectives) return [];
  try {
    const parsed = JSON.parse(objectives);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default syllabusService;
