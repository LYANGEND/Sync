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
  shouldEndConversation?: boolean;
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

// SSE event types from voice-execute endpoint
export interface VoiceResponseEvent {
  type: 'response';
  message: string;
  actions: MasterAIAction[];
  suggestions?: string[];
  conversationId: string;
  isNewConversation?: boolean;
  shouldEndConversation?: boolean;
}

export interface VoiceAudioEvent {
  type: 'audio';
  audio: string; // base64
  sentence: string;
  index: number;
  isFinal: boolean;
  contentType: string;
}

export interface VoiceDoneEvent {
  type: 'done';
  shouldEndConversation?: boolean;
}

export interface VoiceErrorEvent {
  type: 'error';
  error: string;
}

export type VoiceSSEEvent = VoiceResponseEvent | VoiceAudioEvent | VoiceDoneEvent | VoiceErrorEvent;

export interface VoiceConfig {
  provider: string;
  voices: { id: string; name: string; provider: string }[];
  streamingSupported: boolean;
  farewellDetectionEnabled: boolean;
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

  async executeCommand(message: string, conversationId?: string, imageBase64?: string): Promise<MasterAIResponse> {
    const { data } = await api.post('/master-ai/execute', { message, conversationId, imageBase64 });
    return data;
  },

  /**
   * Two-phase streaming voice execute (ElevenLabs-inspired pipeline).
   * Uses SSE to receive the plan filler message immediately, then the
   * full result after tools execute — so the frontend can start TTS
   * on the filler while tools run in the background.
   *
   * Events:
   *   { type: 'quick',  message }              — spoken filler, TTS immediately
   *   { type: 'result', message, actions, ... } — final answer
   *   { type: 'done' }                          — stream complete
   *   { type: 'error',  error }                 — something went wrong
   */
  voiceExecuteStream(
    message: string,
    conversationId: string | undefined,
    onEvent: (event: VoiceSSEEvent | { type: 'quick'; message: string } | { type: 'result'; message: string; actions: MasterAIAction[]; suggestions?: string[]; conversationId: string; isNewConversation?: boolean; shouldEndConversation?: boolean }) => void,
  ): AbortController {
    const controller = new AbortController();
    const token = localStorage.getItem('token');

    fetch('/api/v1/master-ai/voice-execute-v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ message, conversationId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'Request failed' }));
          onEvent({ type: 'error', error: errData.error || `HTTP ${response.status}` });
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          onEvent({ type: 'error', error: 'No response stream' });
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                onEvent(data);
              } catch { /* skip malformed */ }
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          onEvent({ type: 'error', error: err.message || 'Voice execute failed' });
        }
      });

    return controller;
  },

  async getTools(): Promise<MasterAITool[]> {
    const { data } = await api.get('/master-ai/tools');
    return data;
  },

  // ---- Audio ----

  async transcribeAudio(audioBlob: Blob): Promise<string> {
    // Send webm/opus directly — Whisper handles it well and avoids
    // the 300-800ms frontend WAV conversion overhead. The backend
    // prompt + temperature=0 params are the real accuracy levers.
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    
    const { data } = await api.post('/master-ai/transcribe', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data.text;
  },

  async generateSpeech(text: string): Promise<Blob> {
    const response = await api.post('/master-ai/speech', { text }, {
      responseType: 'blob'
    });
    return response.data;
  },

  // ---- Voice Conversation (SSE streaming) ----

  /**
   * Execute a voice command with streaming TTS response via SSE.
   * Returns an AbortController so the caller can interrupt the stream.
   *
   * The backend sends:
   *  1. { type: 'response', message, actions, ... }  — text response
   *  2. { type: 'audio', audio (base64), sentence, index, isFinal } — per-sentence audio
   *  3. { type: 'done', shouldEndConversation }  — stream complete
   */
  voiceExecute(
    message: string,
    conversationId: string | undefined,
    onEvent: (event: VoiceSSEEvent) => void,
  ): AbortController {
    const controller = new AbortController();
    const token = localStorage.getItem('token');

    // Use fetch for SSE (axios doesn't handle streaming well)
    fetch('/api/v1/master-ai/voice-execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ message, conversationId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'Request failed' }));
          onEvent({ type: 'error', error: errData.error || `HTTP ${response.status}` });
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          onEvent({ type: 'error', error: 'No response stream' });
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from the buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // keep incomplete line

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                onEvent(data as VoiceSSEEvent);
              } catch {
                // skip malformed events
              }
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          onEvent({ type: 'error', error: err.message || 'Voice execute failed' });
        }
      });

    return controller;
  },

  async getVoiceConfig(): Promise<VoiceConfig> {
    const { data } = await api.get('/master-ai/voice-config');
    return data;
  },
};

export default masterAIService;

