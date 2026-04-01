import { prisma } from '../utils/prisma';
import axios from 'axios';

interface AIConfig {
  provider: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  // Azure-specific
  azureEndpoint?: string;
  azureApiVersion?: string;
  azureDeployment?: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  image?: string; // Base64 encoded image data URL
}

interface AIResponse {
  content: string;
  tokensUsed?: number;
  model?: string;
}

/**
 * Core AI Service - handles communication with AI providers
 * Supports: Azure OpenAI, OpenAI, Anthropic, Google Gemini
 * Used by all AI-powered features: auto-grading, report remarks, risk analysis, financial advisor, etc.
 */
class AIService {
  private config: AIConfig | null = null;
  private configLoadedAt: number = 0;
  private CONFIG_TTL = 5 * 60 * 1000; // Cache config for 5 minutes

  /** Check if an env var has a real value (not empty or placeholder) */
  private isValidEnvVar(value: string | undefined): boolean {
    return !!value && value !== 'not-set' && value !== 'placeholder' && value.length > 3;
  }

  /**
   * Load AI configuration from school settings, falling back to .env variables
   */
  private async loadConfig(): Promise<AIConfig | null> {
    const now = Date.now();
    if (this.config && now - this.configLoadedAt < this.CONFIG_TTL) {
      return this.config;
    }

    // Try loading from school settings first
    const settings = await prisma.schoolSettings.findFirst();
    if (settings && (settings as any).aiEnabled && (settings as any).aiApiKey) {
      const provider = (settings as any).aiProvider || 'openai';
      this.config = {
        provider,
        apiKey: (settings as any).aiApiKey,
        model: (settings as any).aiModel || 'gpt-4o-mini',
        enabled: (settings as any).aiEnabled,
      };

      // For Azure provider, merge in Azure-specific env vars that aren't stored in DB
      if (provider === 'azure') {
        this.config.azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
        this.config.azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';
        this.config.azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || this.config.model;
        // If the API key from DB doesn't look like an Azure key, prefer the env var
        if (this.isValidEnvVar(process.env.AZURE_OPENAI_API_KEY)) {
          this.config.apiKey = process.env.AZURE_OPENAI_API_KEY!;
        }
        // Azure requires an endpoint — if missing, fall through to env var fallbacks
        if (!this.isValidEnvVar(this.config.azureEndpoint)) {
          this.config = null;
          // Don't return — let it fall through to env var-based config below
        } else {
          this.configLoadedAt = now;
          return this.config;
        }
      } else {
        this.configLoadedAt = now;
        return this.config;
      }
    }

    // Fallback: check for Azure OpenAI env vars
    if (this.isValidEnvVar(process.env.AZURE_OPENAI_API_KEY) && this.isValidEnvVar(process.env.AZURE_OPENAI_ENDPOINT)) {
      this.config = {
        provider: 'azure',
        apiKey: process.env.AZURE_OPENAI_API_KEY!,
        model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
        enabled: true,
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        azureApiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
        azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
      };
      this.configLoadedAt = now;
      return this.config;
    }

    // Fallback: check for standard OpenAI env var
    if (this.isValidEnvVar(process.env.OPENAI_API_KEY)) {
      this.config = {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY!,
        model: 'gpt-4o-mini',
        enabled: true,
      };
      this.configLoadedAt = now;
      return this.config;
    }

    // Fallback: check for Google Gemini env var
    if (this.isValidEnvVar(process.env.GEMINI_API_KEY)) {
      this.config = {
        provider: 'gemini',
        apiKey: process.env.GEMINI_API_KEY!,
        model: 'gemini-2.0-flash',
        enabled: true,
      };
      this.configLoadedAt = now;
      return this.config;
    }

    this.config = null;
    return null;
  }

  /**
   * Check if AI is configured and enabled
   */
  async isAvailable(): Promise<boolean> {
    const config = await this.loadConfig();
    return config !== null && config.enabled;
  }

  /**
   * Send a chat completion request to the AI provider
   */
  async chat(messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  }): Promise<AIResponse> {
    const config = await this.loadConfig();
    if (!config) {
      throw new Error('AI is not configured. Please set up AI in School Settings.');
    }

    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 2000;
    const model = options?.model || config.model;

    try {
      if (config.provider === 'azure') {
        return await this.chatAzureOpenAI(config, messages, temperature, maxTokens);
      } else if (config.provider === 'openai') {
        return await this.chatOpenAI(config.apiKey, model, messages, temperature, maxTokens);
      } else if (config.provider === 'anthropic') {
        return await this.chatAnthropic(config.apiKey, model, messages, temperature, maxTokens);
      } else if (config.provider === 'gemini') {
        return await this.chatGemini(config.apiKey, model, messages, temperature, maxTokens);
      } else {
        throw new Error(`Unsupported AI provider: ${config.provider}`);
      }
    } catch (error: any) {
      const details = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      console.error('AI service error:', details);
      throw new Error(`AI request failed: ${details}`);
    }
  }

  private formatOpenAIMessages(messages: ChatMessage[]) {
    return messages.map(m => {
      if (m.image) {
        return {
          role: m.role,
          content: [
            { type: 'text', text: m.content },
            { type: 'image_url', image_url: { url: m.image } }
          ]
        };
      }
      return { role: m.role, content: m.content };
    });
  }

  /**
   * OpenAI Chat Completion
   */
  private async chatOpenAI(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number
  ): Promise<AIResponse> {
    const formattedMessages = this.formatOpenAIMessages(messages);
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages: formattedMessages,
        temperature,
        max_tokens: maxTokens,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    return {
      content: response.data.choices[0].message.content,
      tokensUsed: response.data.usage?.total_tokens,
      model: response.data.model,
    };
  }

  /**
   * Azure OpenAI Chat Completion
   */
  private async chatAzureOpenAI(
    config: AIConfig,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number
  ): Promise<AIResponse> {
    const endpoint = config.azureEndpoint!.replace(/\/$/, '');
    const deployment = config.azureDeployment || config.model;
    const apiVersion = config.azureApiVersion || '2024-12-01-preview';
    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

    // Some models (o-series, gpt-5.x) don't support temperature or max_tokens
    const isReasoningModel = /^(o[1-9]|gpt-5)/i.test(deployment);
    const formattedMessages = this.formatOpenAIMessages(messages);
    const body: any = {
      messages: formattedMessages,
      max_completion_tokens: maxTokens,
    };
    if (!isReasoningModel) {
      body.temperature = temperature;
    }

    const response = await axios.post(url, body, {
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });

    return {
      content: response.data.choices[0].message.content,
      tokensUsed: response.data.usage?.total_tokens,
      model: response.data.model,
    };
  }

  /**
   * Anthropic Chat Completion
   */
  private async chatAnthropic(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number
  ): Promise<AIResponse> {
    // Separate system message from conversation
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: model || 'claude-3-haiku-20240307',
        max_tokens: maxTokens,
        temperature,
        system: systemMessage?.content || '',
        messages: conversationMessages.map(m => {
          if (m.image) {
            const base64Data = m.image.split(',')[1] || m.image;
            const mimeType = m.image.split(';')[0].split(':')[1] || 'image/jpeg';
            return {
              role: m.role,
              content: [
                { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
                { type: 'text', text: m.content }
              ]
            };
          }
          return {
            role: m.role,
            content: m.content,
          };
        }),
      },
      {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        timeout: 60000,
      }
    );

    return {
      content: response.data.content[0].text,
      tokensUsed: response.data.usage?.input_tokens + response.data.usage?.output_tokens,
      model: response.data.model,
    };
  }

  /**
   * Google Gemini Chat Completion
   */
  private async chatGemini(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number
  ): Promise<AIResponse> {
    const geminiModel = model || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

    // Convert chat messages to Gemini format
    // Gemini uses system_instruction for system messages and contents[] for conversation
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const contents = conversationMessages.map(m => {
      const parts: any[] = [{ text: m.content }];
      if (m.image) {
        const base64Data = m.image.split(',')[1] || m.image;
        const mimeType = m.image.split(';')[0].split(':')[1] || 'image/jpeg';
        parts.push({
          inline_data: { mime_type: mimeType, data: base64Data }
        });
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    const body: any = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };

    if (systemMessage) {
      body.system_instruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    });

    const candidate = response.data.candidates?.[0];
    if (!candidate || !candidate.content?.parts?.[0]?.text) {
      throw new Error('No response from Gemini');
    }

    return {
      content: candidate.content.parts[0].text,
      tokensUsed: response.data.usageMetadata?.totalTokenCount,
      model: geminiModel,
    };
  }

  /**
   * Transcribe Audio to Text (OpenAI Whisper)
   */
  async transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const config = await this.loadConfig();
    if (!config) {
      throw new Error('AI is not configured.');
    }

    // For Azure OpenAI, we need to use Azure's Whisper endpoint
    if (config.provider === 'azure') {
      // Use separate Whisper endpoint if provided, otherwise fall back to main endpoint
      const whisperEndpoint = (process.env.AZURE_WHISPER_ENDPOINT || config.azureEndpoint)!.replace(/\/$/, '');
      const whisperApiKey = process.env.AZURE_WHISPER_API_KEY || config.apiKey;
      const whisperDeployment = process.env.AZURE_WHISPER_DEPLOYMENT || 'whisper';
      const whisperApiVersion = process.env.AZURE_WHISPER_API_VERSION || '2024-06-01';

      const FormData = require('form-data');
      const formData = new FormData();
      
      formData.append('file', audioBuffer, {
        filename: 'audio.webm',
        contentType: mimeType || 'audio/webm',
      });

      try {
        const axios = require('axios');
        const url = `${whisperEndpoint}/openai/deployments/${whisperDeployment}/audio/transcriptions?api-version=${whisperApiVersion}`;
        
        const response = await axios.post(url, formData, {
          headers: {
            'api-key': whisperApiKey,
            ...formData.getHeaders(),
          },
        });

        return response.data.text;
      } catch (error: any) {
        console.error('Azure Whisper transcription error:', error.response?.data || error.message);
        
        if (error.response?.status === 404) {
          throw new Error('Azure Whisper deployment not found. Please deploy a Whisper model in your Azure OpenAI resource or set AZURE_WHISPER_DEPLOYMENT environment variable.');
        }
        
        throw new Error(`Failed to transcribe audio: ${error.response?.data?.error?.message || error.message}`);
      }
    }

    // For standard OpenAI
    if (config.provider === 'openai') {
      const FormData = require('form-data');
      const formData = new FormData();
      
      formData.append('file', audioBuffer, {
        filename: 'audio.webm',
        contentType: mimeType || 'audio/webm',
      });
      formData.append('model', 'whisper-1');

      try {
        const axios = require('axios');
        const response = await axios.post(
          'https://api.openai.com/v1/audio/transcriptions',
          formData,
          {
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              ...formData.getHeaders(),
            },
          }
        );

        return response.data.text;
      } catch (error: any) {
        console.error('OpenAI Whisper transcription error:', error.response?.data || error.message);
        throw new Error(`Failed to transcribe audio: ${error.response?.data?.error?.message || error.message}`);
      }
    }

    throw new Error(`Audio transcription not supported for provider: ${config.provider}`);
  }

  /**
   * Generate Speech from Text (OpenAI TTS)
   */
  async generateSpeech(text: string): Promise<Buffer> {
    const config = await this.loadConfig();
    if (!config) throw new Error('AI is not configured.');
    
    // Clean text to make the TTS sound much more natural
    const cleanText = text
      .replace(/(\*\*|\*|\_\_|\_|\#)/g, '') // remove markdown
      .replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // remove emojis
      .trim();

    // Azure OpenAI TTS
    if (config.provider === 'azure') {
      // Use separate TTS endpoint if provided, otherwise fall back to main endpoint
      const ttsEndpoint = (process.env.AZURE_TTS_ENDPOINT || config.azureEndpoint)!.replace(/\/$/, '');
      const ttsApiKey = process.env.AZURE_TTS_API_KEY || config.apiKey;
      const ttsDeployment = process.env.AZURE_TTS_DEPLOYMENT || 'tts-hd';
      const ttsApiVersion = process.env.AZURE_TTS_API_VERSION || '2025-03-01-preview';

      try {
        const url = `${ttsEndpoint}/openai/deployments/${ttsDeployment}/audio/speech?api-version=${ttsApiVersion}`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'api-key': ttsApiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: cleanText,
            voice: 'nova',
            response_format: 'mp3',
            speed: 1.0
          })
        });
        
        if (!response.ok) {
          const errText = await response.text();
          
          if (response.status === 404) {
            throw new Error('Azure TTS deployment not found. Please deploy a TTS model in your Azure OpenAI resource or set AZURE_TTS_DEPLOYMENT environment variable.');
          }
          
          throw new Error(`Azure TTS API error: ${response.statusText} - ${errText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (error: any) {
        console.error('Azure TTS error:', error.message);
        throw new Error(`Failed to generate speech: ${error.message}`);
      }
    }

    // Standard OpenAI TTS
    if (config.provider === 'openai') {
      try {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: cleanText,
            voice: 'nova',
            response_format: 'mp3',
            speed: 1.0
          })
        });
        
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`TTS API error: ${response.statusText} - ${errText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (error: any) {
        console.error('TTS error:', error.message);
        throw new Error(`Failed to generate speech: ${error.message}`);
      }
    }

    throw new Error(`Text-to-speech not supported for provider: ${config.provider}`);
  }

  /**
   * Generate a simple text completion
   */
  async generateText(prompt: string, options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const messages: ChatMessage[] = [];
    
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });

    const response = await this.chat(messages, {
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });

    return response.content;
  }

  /**
   * Generate structured JSON output from AI
   */
  async generateJSON<T = any>(prompt: string, options?: {
    systemPrompt?: string;
    temperature?: number;
  }): Promise<T> {
    const systemPrompt = (options?.systemPrompt || '') + 
      '\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.';

    const result = await this.generateText(prompt, {
      systemPrompt,
      temperature: options?.temperature ?? 0.3,
    });

    // Clean potential markdown code blocks
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (parseError) {
      console.error('AI returned invalid JSON. Raw response:', result.substring(0, 500));
      throw new Error('AI returned an invalid response. Please try again.');
    }
  }
}

// Export singleton instance
export const aiService = new AIService();
export default aiService;
