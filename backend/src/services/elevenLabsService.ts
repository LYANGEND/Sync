import axios from 'axios';
import { prisma } from '../utils/prisma';

interface ElevenLabsConfig {
  apiKey: string;
  defaultVoiceId: string;
  modelId: string;
}

interface Voice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url: string;
}

interface TTSOptions {
  voiceId?: string;
  modelId?: string;
  stability?: number;        // 0-1, lower = more variable/expressive
  similarityBoost?: number;  // 0-1, higher = closer to original voice
  style?: number;            // 0-1, style exaggeration
  speakerBoost?: boolean;
  outputFormat?: string;     // mp3_44100_128, pcm_16000, etc.
}

interface TTSResult {
  audioBuffer: Buffer;
  contentType: string;
  charactersUsed: number;
}

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

// Recommended voices for teaching
export const TEACHING_VOICES = {
  // Professional, warm, clear voices good for teaching
  RACHEL: '21m00Tcm4TlvDq8ikWAM',    // American, female, calm
  DREW: '29vD33N1CtxCmqQRPOHJ',       // American, male, well-rounded
  CLYDE: '2EiwWnXFnvU5JabPnv8n',      // American, male, deep
  DOMI: 'AZnzlk1XvdvUeBnXmlld',       // American, female, strong
  BELLA: 'EXAVITQu4vr4xnSDxMaL',      // American, female, soft
  ELLI: 'MF3mGyEYCl7XYWbV9V6O',       // American, female, young
  JOSH: 'TxGEqnHWrfWFTfGW9XjX',       // American, male, deep
  ARNOLD: 'VR6AewLTigWG4xSOukaG',     // American, male, crisp
  ADAM: 'pNInz6obpgDQGcFmaJgB',       // American, male, deep
  SAM: 'yoZ06aMxZJJ28mfd3POQ',        // American, male, raspy
};

class ElevenLabsService {
  private config: ElevenLabsConfig | null = null;
  private configLoadedAt: number = 0;
  private CONFIG_TTL = 5 * 60 * 1000; // 5-minute cache

  /**
   * Load ElevenLabs configuration from school settings or environment
   */
  private async loadConfig(): Promise<ElevenLabsConfig | null> {
    const now = Date.now();
    if (this.config && now - this.configLoadedAt < this.CONFIG_TTL) {
      return this.config;
    }

    // Try school settings first
    const settings = await prisma.schoolSettings.findFirst();
    const settingsAny = settings as any;
    
    let apiKey = settingsAny?.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey || apiKey.length < 10) {
      console.warn('[ElevenLabs] No API key configured');
      return null;
    }

    this.config = {
      apiKey,
      defaultVoiceId: settingsAny?.elevenLabsVoiceId || process.env.ELEVENLABS_VOICE_ID || TEACHING_VOICES.RACHEL,
      modelId: settingsAny?.elevenLabsModel || process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5',
    };
    this.configLoadedAt = now;
    return this.config;
  }

  /**
   * Convert text to speech using ElevenLabs API
   * Returns audio buffer (MP3 by default)
   */
  async textToSpeech(text: string, options: TTSOptions = {}): Promise<TTSResult | null> {
    const config = await this.loadConfig();
    if (!config) {
      console.error('[ElevenLabs] Service not configured');
      return null;
    }

    const voiceId = options.voiceId || config.defaultVoiceId;
    const modelId = options.modelId || config.modelId;
    const outputFormat = options.outputFormat || 'mp3_44100_128';

    try {
      const response = await axios.post(
        `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}?output_format=${outputFormat}`,
        {
          text,
          model_id: modelId,
          voice_settings: {
            stability: options.stability ?? 0.5,
            similarity_boost: options.similarityBoost ?? 0.75,
            style: options.style ?? 0.3,
            use_speaker_boost: options.speakerBoost ?? true,
          },
        },
        {
          headers: {
            'xi-api-key': config.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          responseType: 'arraybuffer',
          timeout: 30000, // 30s timeout
        }
      );

      return {
        audioBuffer: Buffer.from(response.data),
        contentType: 'audio/mpeg',
        charactersUsed: text.length,
      };
    } catch (error: any) {
      console.error('[ElevenLabs] TTS error:', error.response?.data?.toString() || error.message);
      throw new Error(`ElevenLabs TTS failed: ${error.response?.status || error.message}`);
    }
  }

  /**
   * Stream text-to-speech (returns streaming response for lower latency)
   * Used for real-time voice responses in the classroom
   */
  async streamTextToSpeech(text: string, options: TTSOptions = {}): Promise<any> {
    const config = await this.loadConfig();
    if (!config) {
      throw new Error('ElevenLabs not configured');
    }

    const voiceId = options.voiceId || config.defaultVoiceId;
    const modelId = options.modelId || config.modelId;
    const outputFormat = options.outputFormat || 'mp3_44100_128';

    const response = await axios.post(
      `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`,
      {
        text,
        model_id: modelId,
        voice_settings: {
          stability: options.stability ?? 0.5,
          similarity_boost: options.similarityBoost ?? 0.75,
          style: options.style ?? 0.3,
          use_speaker_boost: options.speakerBoost ?? true,
        },
      },
      {
        headers: {
          'xi-api-key': config.apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
        timeout: 60000,
      }
    );

    return response.data;
  }

  /**
   * List all available voices from ElevenLabs
   */
  async getVoices(): Promise<Voice[]> {
    const config = await this.loadConfig();
    if (!config) {
      throw new Error('ElevenLabs not configured');
    }

    try {
      const response = await axios.get(`${ELEVENLABS_BASE_URL}/voices`, {
        headers: {
          'xi-api-key': config.apiKey,
        },
      });

      return response.data.voices || [];
    } catch (error: any) {
      console.error('[ElevenLabs] Get voices error:', error.message);
      throw new Error('Failed to fetch voices');
    }
  }

  /**
   * Get user subscription info (to check character quota)
   */
  async getSubscriptionInfo(): Promise<any> {
    const config = await this.loadConfig();
    if (!config) {
      throw new Error('ElevenLabs not configured');
    }

    try {
      const response = await axios.get(`${ELEVENLABS_BASE_URL}/user/subscription`, {
        headers: {
          'xi-api-key': config.apiKey,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('[ElevenLabs] Subscription info error:', error.message);
      throw new Error('Failed to fetch subscription info');
    }
  }

  /**
   * Generate teaching-optimized speech with appropriate pacing
   * Adds natural pauses, emphasis for educational content
   */
  async teacherSpeak(text: string, options: TTSOptions = {}): Promise<TTSResult | null> {
    // Teaching voice settings: slightly slower, more stable, clear enunciation
    return this.textToSpeech(text, {
      ...options,
      stability: options.stability ?? 0.6,       // More consistent for teaching
      similarityBoost: options.similarityBoost ?? 0.8,
      style: options.style ?? 0.2,               // Less dramatic for clarity
      speakerBoost: true,
    });
  }

  /**
   * Check if the service is properly configured
   */
  async isConfigured(): Promise<boolean> {
    const config = await this.loadConfig();
    return config !== null;
  }
}

export const elevenLabsService = new ElevenLabsService();
export default elevenLabsService;
