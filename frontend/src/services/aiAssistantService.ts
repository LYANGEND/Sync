import api from '../utils/api';

// Types
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface Artifact {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  published: boolean;
  createdAt: string;
}

export interface FavoritePrompt {
  id: string;
  title: string;
  prompt: string;
  category: string;
  createdAt: string;
}

export interface ChatResponse {
  conversationId: string;
  message: { id: string; role: string; content: string; createdAt: string };
  tokensUsed?: number;
}

export interface AIStatus {
  available: boolean;
  provider?: string;
  model?: string;
  enabled?: boolean;
}

export interface SubjectTopic {
  id: string;
  title: string;
  description?: string;
  gradeLevel: number;
  orderIndex: number;
}

export interface SystemSubject {
  id: string;
  name: string;
  code: string;
  classes: { id: string; name: string; gradeLevel: number }[];
  topics: SubjectTopic[];
}

export interface SubjectsContextResponse {
  subjects: SystemSubject[];
  byGrade: Record<number, SystemSubject[]>;
}

const aiAssistantService = {
  // Status
  getStatus: () =>
    api.get<AIStatus>('/ai-assistant/status').then(r => r.data),

  // Conversations
  getConversations: () =>
    api.get<Conversation[]>('/ai-assistant/conversations').then(r => r.data),

  createConversation: (title: string) =>
    api.post<Conversation>('/ai-assistant/conversations', { title }).then(r => r.data),

  getConversation: (id: string) =>
    api.get<{ conversation: Conversation; messages: Message[] }>(`/ai-assistant/conversations/${id}`).then(r => r.data),

  deleteConversation: (id: string) =>
    api.delete(`/ai-assistant/conversations/${id}`).then(r => r.data),

  // Chat - conversationId in body
  sendMessage: (conversationId: string, message: string) =>
    api.post<ChatResponse>('/ai-assistant/chat', { conversationId, message }).then(r => r.data),

  // Slash Commands - command + params in body
  executeCommand: (conversationId: string, command: string, args: string) =>
    api.post<ChatResponse>('/ai-assistant/command', {
      conversationId,
      command,
      params: { text: args },
    }).then(r => r.data),

  // Artifacts - flat routes
  getArtifacts: (type?: string) =>
    api.get<Artifact[]>('/ai-assistant/artifacts', { params: type ? { type } : undefined }).then(r => r.data),

  saveArtifact: (data: { conversationId?: string; type: string; title: string; content: string; metadata?: Record<string, unknown> }) =>
    api.post<Artifact>('/ai-assistant/artifacts', data).then(r => r.data),

  deleteArtifact: (artifactId: string) =>
    api.delete(`/ai-assistant/artifacts/${artifactId}`).then(r => r.data),

  // Favorite Prompts - flat routes
  getFavorites: () =>
    api.get<FavoritePrompt[]>('/ai-assistant/prompts').then(r => r.data),

  saveFavorite: (data: { title: string; prompt: string; category: string }) =>
    api.post<FavoritePrompt>('/ai-assistant/prompts', data).then(r => r.data),

  deleteFavorite: (id: string) =>
    api.delete(`/ai-assistant/prompts/${id}`).then(r => r.data),

  // Report Remarks
  generateRemarks: (studentId: string, termId: string) =>
    api.post<{ remarks: string }>('/ai-assistant/report-remarks', { studentId, termId }).then(r => r.data),

  // Teaching Context
  getTeachingContext: () =>
    api.get<{ classes: any[]; subjects: any[] }>('/ai-assistant/teaching-context').then(r => r.data),

  // All subjects with grade grouping and topics
  getAllSubjects: () =>
    api.get<SubjectsContextResponse>('/ai-assistant/subjects').then(r => r.data),

  // Student Insights
  getStudentInsights: (params: { classId: string; subjectId?: string }) =>
    api.get('/ai-assistant/student-insights', { params }).then(r => r.data),
};

export default aiAssistantService;
