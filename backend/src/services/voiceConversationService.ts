import aiService from './aiService';

// ============================================================
// VOICE CONVERSATION SERVICE  (Azure AI only — no ElevenLabs)
// ============================================================
// Provides low-latency, human-like voice conversation by:
// 1. Splitting AI responses into sentences for pipelined TTS
// 2. Each sentence is converted to audio independently → first sentence
//    plays immediately while the rest are being generated
// 3. Detecting farewell intents so the frontend can gracefully end the call
// 4. Supporting mid-response interruption via shouldAbort callback

interface VoiceConversationOptions {
  onSentenceAudio?: (audio: Buffer, sentence: string, index: number, isFinal: boolean) => void;
  onError?: (error: Error) => void;
  shouldAbort?: () => boolean;
}

// ================================================================
// FAREWELL / CONVERSATION-END DETECTION
// ================================================================

const FAREWELL_PATTERNS = [
  // English farewells
  /\b(goodbye|good\s?bye|bye[\s-]?bye|bye|see\s?ya|see\s?you|later|take\s?care)\b/i,
  /\b(have\s?a\s?(good|nice|great|wonderful)\s?(day|night|evening|one|time|weekend))\b/i,
  // Gratitude that signals end
  /\b(thank\s?you\s*(so\s*much|very\s*much)?|thanks\s*(a\s*lot|so\s*much)?|cheers|much\s*appreciated|appreciate\s*it)\b/i,
  // "That's all" variants
  /\b(that['']?\s*s?\s*(all|it|everything)|nothing\s*(else|more)|i['']?\s*m?\s*(done|good|fine|okay|ok|set|finished))\b/i,
  // Explicit end request
  /\b(end|stop|close|exit|quit|leave)\s*(the\s*)?(call|chat|conversation|session|voice(\s*mode)?)\b/i,
  // Night sign-offs
  /\b(good\s*night|nighty?\s*night|sweet\s*dreams)\b/i,
  // Short final confirmations (only match when they ARE the whole message)
  /^\s*(ok|okay|alright|cool|great|perfect|wonderful|awesome|nice|got\s*it|no\s*that['']?\s*s?\s*(all|it))\s*[.!]?\s*$/i,
];

/**
 * Detect whether the user's message signals they want to end the conversation.
 * Returns isFarewell=true when confidence ≥ 0.6
 */
export function detectFarewell(text: string): { isFarewell: boolean; confidence: number } {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return { isFarewell: false, confidence: 0 };

  // Count how many farewell patterns match
  const matchCount = FAREWELL_PATTERNS.filter(p => p.test(normalized)).length;
  if (matchCount === 0) return { isFarewell: false, confidence: 0 };

  // Short messages with farewell signals → high confidence
  let confidence: number;
  if (normalized.length < 50) {
    confidence = Math.min(0.5 + matchCount * 0.2, 1.0);
  } else {
    // Longer messages — check if farewell is near the end
    const lastPart = normalized.slice(-60);
    const endMatch = FAREWELL_PATTERNS.filter(p => p.test(lastPart)).length;
    confidence = endMatch > 0 ? Math.min(0.4 + endMatch * 0.15, 0.85) : 0.3;
  }

  return { isFarewell: confidence >= 0.6, confidence };
}

/**
 * Check if the AI's own response is a goodbye (e.g. "Goodbye! Have a great day!")
 */
export function detectAIFarewell(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /\b(goodbye|bye|farewell|take\s*care|see\s*you|until\s*next\s*time|have\s*a\s*(good|nice|great|wonderful)\s*(day|night|evening|one))\b/i.test(normalized);
}

// ================================================================
// TEXT → SENTENCE SPLITTING
// ================================================================

/**
 * Split text into speakable sentences. Cleans markdown, handles edge
 * cases like abbreviations and decimals, keeps chunks a good size
 * for natural-sounding TTS.
 */
function splitIntoSentences(text: string): string[] {
  const clean = text
    .replace(/(\*\*|\*|__|_|#)/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/---+/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();

  if (!clean) return [];

  const parts = clean.split(/(?<=[.!?])\s+|(?<=\n)\s*/);
  const sentences: string[] = [];
  let current = '';

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    current += (current ? ' ' : '') + trimmed;

    if ((/[.!?]$/.test(current) && current.length > 10) || current.length > 200) {
      sentences.push(current);
      current = '';
    }
  }
  if (current.trim()) sentences.push(current.trim());
  return sentences.filter(s => s.length > 0);
}

// ================================================================
// TTS GENERATION  (Azure AI / OpenAI — via aiService)
// ================================================================

async function generateSentenceSpeech(sentence: string): Promise<Buffer> {
  return aiService.generateSpeech(sentence);
}

/**
 * Stream a voice response: splits the full AI text into sentences,
 * generates TTS for each one independently, and calls onSentenceAudio
 * as each audio chunk becomes ready.
 *
 * The frontend plays sentence 1 while sentence 2 is being generated,
 * dramatically reducing perceived latency.
 */
export async function streamVoiceResponse(
  fullText: string,
  options: VoiceConversationOptions = {},
): Promise<void> {
  const { onSentenceAudio, onError, shouldAbort } = options;

  const sentences = splitIntoSentences(fullText);
  if (sentences.length === 0) return;

  for (let i = 0; i < sentences.length; i++) {
    if (shouldAbort?.()) {
      console.log('[VoiceConversation] Response interrupted by user');
      return;
    }

    try {
      const audioBuffer = await generateSentenceSpeech(sentences[i]);
      const isFinal = i === sentences.length - 1;
      onSentenceAudio?.(audioBuffer, sentences[i], i, isFinal);
    } catch (error) {
      console.error(`[VoiceConversation] TTS error for sentence ${i}:`, error);
      onError?.(error as Error);
    }
  }
}

/**
 * Quick one-shot TTS for short utterances (greetings, confirmations, goodbyes).
 */
export async function quickSpeak(text: string): Promise<Buffer> {
  return generateSentenceSpeech(text);
}

export { splitIntoSentences };
