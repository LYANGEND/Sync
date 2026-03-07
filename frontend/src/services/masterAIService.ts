import api from '../utils/api';

export interface MasterAIAction {
  tool: string;
  success: boolean;
  data?: any;
  error?: string;
  summary: string;
}

export interface MasterAIResponse {
  message: string;
  actions: MasterAIAction[];
  suggestions?: string[];
  conversationId: string;
  isNewConversation?: boolean;
}

export interface MasterAITool {
  name: string;
  description: string;
}

export interface MasterAIConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
}

export interface MasterAIMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

const masterAIService = {
  // ---- Conversations ----

  async createConversation(): Promise<MasterAIConversation> {
    const { data } = await api.post('/master-ai/conversations');
    return data;
  },

  async getConversations(): Promise<MasterAIConversation[]> {
    const { data } = await api.get('/master-ai/conversations');
    return data;
  },

  async getConversation(id: string): Promise<{ conversation: MasterAIConversation; messages: MasterAIMessage[] }> {
    const { data } = await api.get(`/master-ai/conversations/${id}`);
    return data;
  },

  async updateConversation(id: string, title: string): Promise<MasterAIConversation> {
    const { data } = await api.patch(`/master-ai/conversations/${id}`, { title });
    return data;
  },

  async deleteConversation(id: string): Promise<void> {
    await api.delete(`/master-ai/conversations/${id}`);
  },

  // ---- Execute ----

  async executeCommand(message: string, conversationId?: string): Promise<MasterAIResponse> {
    const { data } = await api.post('/master-ai/execute', { message, conversationId });
    return data;
  },

  async getTools(): Promise<MasterAITool[]> {
    const { data } = await api.get('/master-ai/tools');
    return data;
  },
};

export default masterAIService;
