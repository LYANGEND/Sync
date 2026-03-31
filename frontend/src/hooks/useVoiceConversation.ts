import { useState, useRef, useCallback, useEffect } from 'react';
import masterAIService from '../services/masterAIService';
import type { MasterAIResponse, MasterAIAction } from '../services/masterAIService';
import toast from 'react-hot-toast';

// ================================================================
// useVoiceConversation  — Smooth, human-like voice chat hook
// ================================================================
//
// ARCHITECTURE (using existing stable endpoints — no SSE required):
//   User speaks → MediaRecorder → Whisper STT → text
//       ↓
//   executeCommand() → AI response text
//       ↓
//   Client-side sentence split → generateSpeech() per sentence
//       ↓
//   Audio queue plays chunks back-to-back with no gap
//       ↓
//   Last chunk finishes → auto-start listening again
//       ↓
//   User says "bye"/"thank you" → farewell → end voice mode
//
// IMPORTANT: All cross-referencing functions are stored in useRef to
// avoid stale closure issues that plagued the previous implementation.

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'ending';

interface VoiceConversationReturn {
  voiceState: VoiceState;
  isActive: boolean;
  currentTranscript: string;
  startVoiceMode: () => Promise<void>;
  stopVoiceMode: () => void;
  interruptAI: () => void;
  audioLevel: number;
}

// Response shape passed to the onResponse callback
export interface VoiceResponse {
  type: 'response';
  message: string;
  actions: MasterAIAction[];
  suggestions?: string[];
  conversationId: string;
  isNewConversation?: boolean;
  shouldEndConversation?: boolean;
}

interface VoiceConversationOptions {
  conversationId: string | null;
  onResponse: (response: VoiceResponse) => void;
  onConversationEnd: () => void;
  onError: (error: string) => void;
  onTranscript: (text: string) => void;
  onConversationIdChange: (id: string) => void;
}

// ---- Farewell detection ----
const FAREWELL_RE = [
  /\b(bye|goodbye|good\s?bye|bye[\s-]?bye|see\s?ya|see\s?you|later|take\s?care)\b/i,
  /\b(thank\s?you|thanks|cheers|appreciate\s*it)\b/i,
  /\b(that['']?\s*s?\s*(all|it|everything)|i['']?\s*m?\s*(done|good|finished))\b/i,
  /\b(end|stop|exit|quit)\s*(the\s*)?(call|chat|conversation|voice)\b/i,
  /\b(good\s*night|nighty?\s*night)\b/i,
];

function isClientFarewell(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length > 80) return false;
  return FAREWELL_RE.some(r => r.test(t));
}

// ---- AI farewell detection (for the AI's response) ----
const AI_FAREWELL_RE = [
  /\b(goodbye|good\s?bye|farewell|take\s?care)\b/i,
  /\b(was\s+nice|been\s+a\s+pleasure|glad\s+i?\s*could\s+help)\b/i,
  /\b(have\s+a\s+(great|good|wonderful|nice))\b/i,
  /\b(until\s+next\s+time|see\s+you|talk\s+(soon|later))\b/i,
];

function isAIFarewell(text: string): boolean {
  const t = text.trim().toLowerCase();
  return AI_FAREWELL_RE.some(r => r.test(t));
}

// ---- Sentence splitting for pipelined TTS ----
function splitIntoSentences(text: string): string[] {
  // Clean markdown/emojis that don't speak well
  let clean = text
    .replace(/```[\s\S]*?```/g, ' (code block) ')
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/[*_~]{1,3}/g, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '. ')
    .replace(/^\s*\d+\.\s+/gm, '. ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[🎉🎊🚀💡✨🔥👋😊🙏❤️💪🎯📝📚✅❌⚠️]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return [];

  // Split on sentence boundaries
  const parts = clean.split(/(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])\s*$/);
  const sentences: string[] = [];

  for (const part of parts) {
    const s = part.trim();
    if (s.length >= 3) sentences.push(s);
  }

  // If no sentence breaks found, split on commas / semicolons for long text
  if (sentences.length <= 1 && clean.length > 120) {
    const clauseParts = clean.split(/(?<=[,;:])\s+/);
    const merged: string[] = [];
    let current = '';
    for (const cp of clauseParts) {
      if ((current + ' ' + cp).length < 100) {
        current = current ? current + ' ' + cp : cp;
      } else {
        if (current) merged.push(current);
        current = cp;
      }
    }
    if (current) merged.push(current);
    return merged.length > 1 ? merged : [clean];
  }

  return sentences.length > 0 ? sentences : [clean];
}

export function useVoiceConversation(options: VoiceConversationOptions): VoiceConversationReturn {
  // ---- Keep callbacks in refs so inner closures never go stale ----
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  // Core refs
  const isActiveRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioQueueRef = useRef<HTMLAudioElement[]>([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const conversationIdRef = useRef<string | null>(options.conversationId);
  const errorCountRef = useRef(0);
  const maxRecordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- FUNCTION REFS: these break circular closure dependencies ----
  const startListeningRef = useRef<() => Promise<void>>();
  const sendVoiceCommandRef = useRef<(text: string, isFarewell: boolean) => void>();
  const stopVoiceModeRef = useRef<() => void>();

  // Keep conversationId ref in sync
  useEffect(() => {
    conversationIdRef.current = options.conversationId;
  }, [options.conversationId]);

  // ==================================================================
  // AUDIO QUEUE — play chunks back-to-back with no gap
  // ==================================================================
  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      // All audio done — restart listening if still active
      if (isActiveRef.current) {
        console.log('[Voice] Audio queue empty, restarting listening');
        setVoiceState('listening');
        setTimeout(() => startListeningRef.current?.(), 300);
      }
      return;
    }

    isPlayingRef.current = true;
    const audio = audioQueueRef.current.shift()!;
    currentAudioRef.current = audio;

    audio.onended = () => {
      currentAudioRef.current = null;
      URL.revokeObjectURL(audio.src);
      playNextInQueue();
    };

    audio.onerror = () => {
      currentAudioRef.current = null;
      URL.revokeObjectURL(audio.src);
      playNextInQueue();
    };

    audio.play().catch(() => playNextInQueue());
  }, []);

  // ==================================================================
  // INTERRUPT — stop AI audio so user can speak
  // ==================================================================
  const interruptAI = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.onended = null;
      URL.revokeObjectURL(currentAudioRef.current.src);
      currentAudioRef.current = null;
    }
    audioQueueRef.current.forEach(a => URL.revokeObjectURL(a.src));
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  // ==================================================================
  // STOP RECORDING helper
  // ==================================================================
  const doStopRecording = useCallback(() => {
    if (maxRecordTimerRef.current) { clearTimeout(maxRecordTimerRef.current); maxRecordTimerRef.current = null; }
    cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ==================================================================
  // START LISTENING — microphone + silence detection
  // ==================================================================
  // We define this as a plain function assigned to a ref so there are
  // no stale-closure issues when it's called from playNextInQueue,
  // sendVoiceCommand, etc.

  const startListeningImpl = useCallback(async () => {
    if (!isActiveRef.current) {
      console.log('[Voice] startListening: not active, skipping');
      return;
    }

    console.log('[Voice] Starting to listen...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus' : 'audio/webm',
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // ---- Audio analysis ----
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // ---- Silence detection state (all in local closure) ----
      let speechDetected = false;
      let silenceStartTime: number | null = null;
      const SILENCE_THRESHOLD = 12;
      const SILENCE_AFTER_SPEECH = 1500;
      const MAX_WAIT_FOR_SPEECH = 6000;
      const MAX_RECORDING = 30000;
      const recordStartTime = Date.now();

      // Safety net: hard max recording
      maxRecordTimerRef.current = setTimeout(() => {
        console.log('[Voice] Max recording reached (30s), stopping');
        doStopRecording();
      }, MAX_RECORDING);

      const checkAudio = () => {
        if (!analyserRef.current || !isActiveRef.current) return;

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i] * dataArray[i];
        const rms = Math.sqrt(sum / bufferLength);

        setAudioLevel(Math.min(rms / 60, 1));
        const now = Date.now();

        if (rms > SILENCE_THRESHOLD) {
          speechDetected = true;
          silenceStartTime = null;
        } else {
          if (speechDetected) {
            if (silenceStartTime === null) {
              silenceStartTime = now;
            } else if (now - silenceStartTime > SILENCE_AFTER_SPEECH) {
              console.log('[Voice] Silence after speech detected, stopping');
              doStopRecording();
              return;
            }
          } else if (now - recordStartTime > MAX_WAIT_FOR_SPEECH) {
            console.log('[Voice] No speech for 6s, stopping');
            doStopRecording();
            return;
          }
        }

        animFrameRef.current = requestAnimationFrame(checkAudio);
      };

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        console.log('[Voice] MediaRecorder stopped, processing...');
        if (maxRecordTimerRef.current) { clearTimeout(maxRecordTimerRef.current); maxRecordTimerRef.current = null; }
        cancelAnimationFrame(animFrameRef.current);
        setAudioLevel(0);

        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }

        if (!isActiveRef.current) {
          console.log('[Voice] No longer active after recording stopped');
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        console.log(`[Voice] Audio blob: ${audioBlob.size} bytes, speechDetected: ${speechDetected}`);

        // Skip noise-only recordings
        if (audioBlob.size < 4000 || !speechDetected) {
          console.log('[Voice] No meaningful audio, restarting listening');
          if (isActiveRef.current && errorCountRef.current < 3) {
            setVoiceState('listening');
            setTimeout(() => startListeningRef.current?.(), 600);
          }
          return;
        }

        // Transcribe
        setVoiceState('processing');
        setCurrentTranscript('');

        try {
          console.log('[Voice] Transcribing audio...');
          const text = await masterAIService.transcribeAudio(audioBlob);
          errorCountRef.current = 0;
          console.log(`[Voice] Transcription: "${text}"`);

          if (!text.trim()) {
            console.log('[Voice] Empty transcription, restarting');
            if (isActiveRef.current) {
              setVoiceState('listening');
              setTimeout(() => startListeningRef.current?.(), 400);
            }
            return;
          }

          setCurrentTranscript(text);
          optionsRef.current.onTranscript(text);

          const isFarewell = isClientFarewell(text);
          console.log(`[Voice] Sending command, farewell=${isFarewell}`);

          // Use ref to call the latest sendVoiceCommand
          sendVoiceCommandRef.current?.(text, isFarewell);
        } catch (err: any) {
          errorCountRef.current++;
          console.error('[Voice] Transcription error:', err);

          if (errorCountRef.current >= 3) {
            optionsRef.current.onError('Audio service unavailable. Exiting voice mode.');
            stopVoiceModeRef.current?.();
            return;
          }

          toast.error('Failed to transcribe — please try again');
          if (isActiveRef.current) {
            setVoiceState('listening');
            const delay = Math.min(1000 * Math.pow(2, errorCountRef.current - 1), 4000);
            setTimeout(() => startListeningRef.current?.(), delay);
          }
        }
      };

      mediaRecorder.start(250);
      setVoiceState('listening');
      checkAudio();
    } catch (err) {
      console.error('[Voice] Mic error:', err);
      optionsRef.current.onError('Microphone access denied or unavailable');
      stopVoiceModeRef.current?.();
    }
  }, [doStopRecording]);

  // Keep the ref pointing to the latest implementation
  useEffect(() => { startListeningRef.current = startListeningImpl; }, [startListeningImpl]);

  // ==================================================================
  // SEND VOICE COMMAND via existing stable endpoints (no SSE)
  // Uses executeCommand() + generateSpeech() per sentence for
  // pipelined TTS with no gaps.
  // ==================================================================
  const sendVoiceCommandImpl = useCallback(async (text: string, isFarewell: boolean) => {
    console.log('[Voice] Sending voice command via stable endpoints...');
    setVoiceState('processing');

    try {
      // 1. Get AI text response via the existing working endpoint
      const response: MasterAIResponse = await masterAIService.executeCommand(
        text,
        conversationIdRef.current || undefined,
      );

      console.log('[Voice] Got AI response:', response.message?.slice(0, 60));

      // Notify parent of the response (to update chat UI)
      optionsRef.current.onResponse({
        type: 'response',
        message: response.message,
        actions: response.actions,
        suggestions: response.suggestions,
        conversationId: response.conversationId,
        isNewConversation: response.isNewConversation,
        shouldEndConversation: response.shouldEndConversation,
      });

      // Track conversation ID
      if (response.conversationId && response.conversationId !== conversationIdRef.current) {
        conversationIdRef.current = response.conversationId;
        optionsRef.current.onConversationIdChange(response.conversationId);
      }

      // Check if conversation should end
      const shouldEnd = isFarewell
        || response.shouldEndConversation
        || isAIFarewell(response.message || '');

      if (!isActiveRef.current) return;

      // 2. Split response into sentences for pipelined TTS
      const sentences = splitIntoSentences(response.message || '');
      console.log(`[Voice] Split into ${sentences.length} sentences for TTS`);

      if (sentences.length === 0) {
        // No speakable content — go back to listening or end
        if (shouldEnd) {
          setVoiceState('ending');
          isActiveRef.current = false;
          setTimeout(() => {
            stopVoiceModeRef.current?.();
            optionsRef.current.onConversationEnd();
          }, 800);
        } else if (isActiveRef.current) {
          setVoiceState('listening');
          setTimeout(() => startListeningRef.current?.(), 300);
        }
        return;
      }

      // 3. Generate TTS for each sentence progressively (pipeline)
      //    Start playing as soon as the first chunk arrives.
      setVoiceState('speaking');

      // Fire all TTS requests concurrently but enqueue in order
      const ttsPromises = sentences.map((sentence, index) =>
        masterAIService.generateSpeech(sentence)
          .then(blob => ({ blob, index, ok: true as const }))
          .catch(err => {
            console.warn(`[Voice] TTS failed for sentence ${index}:`, err);
            return { blob: null, index, ok: false as const };
          })
      );

      // Process results as they come in, but enqueue in sentence order
      const results = new Array<{ blob: Blob | null; ok: boolean }>(sentences.length);
      let nextToEnqueue = 0;

      // Wrap each promise to track completion
      const inFlightPromises = ttsPromises.map(async (promise, idx) => {
        const result = await promise;
        results[idx] = { blob: result.ok ? result.blob : null, ok: result.ok };

        // Enqueue all consecutive ready results in order
        while (nextToEnqueue < results.length && results[nextToEnqueue] !== undefined) {
          const r = results[nextToEnqueue];
          if (r.ok && r.blob && isActiveRef.current) {
            const url = URL.createObjectURL(r.blob);
            const audio = new Audio(url);
            audioQueueRef.current.push(audio);

            // Start playback as soon as the first chunk is ready
            if (!isPlayingRef.current) {
              isPlayingRef.current = true;
              playNextInQueue();
            }
          }
          nextToEnqueue++;
        }
      });

      // Wait for all TTS to complete
      await Promise.all(inFlightPromises);

      console.log(`[Voice] All ${sentences.length} TTS chunks generated, shouldEnd=${shouldEnd}`);

      // 4. Handle farewell / end of conversation
      if (shouldEnd) {
        const waitAndEnd = () => {
          if (isPlayingRef.current || audioQueueRef.current.length > 0) {
            setTimeout(waitAndEnd, 200);
          } else {
            setVoiceState('ending');
            isActiveRef.current = false;
            setTimeout(() => {
              stopVoiceModeRef.current?.();
              optionsRef.current.onConversationEnd();
            }, 1200);
          }
        };
        waitAndEnd();
      }
      // If NOT farewell: playNextInQueue will auto-restart listening
      // when the audio queue empties (already handled in playNextInQueue)

    } catch (err: any) {
      console.error('[Voice] Command execution error:', err);

      errorCountRef.current++;
      if (errorCountRef.current >= 3) {
        optionsRef.current.onError('Voice service unavailable. Exiting voice mode.');
        stopVoiceModeRef.current?.();
        return;
      }

      toast.error('Failed to get response — please try again');
      if (isActiveRef.current) {
        setVoiceState('listening');
        const delay = Math.min(1000 * Math.pow(2, errorCountRef.current - 1), 4000);
        setTimeout(() => startListeningRef.current?.(), delay);
      }
    }
  }, [playNextInQueue]);

  // Keep the ref updated
  useEffect(() => { sendVoiceCommandRef.current = sendVoiceCommandImpl; }, [sendVoiceCommandImpl]);

  // ==================================================================
  // PUBLIC API
  // ==================================================================
  const startVoiceMode = useCallback(async () => {
    isActiveRef.current = true;
    errorCountRef.current = 0;
    setVoiceState('speaking');
    setCurrentTranscript('');

    const greeting = "Hi there! I'm listening. How can I help you today?";
    try {
      const blob = await masterAIService.generateSpeech(greeting);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      isPlayingRef.current = true;

      audio.onended = () => {
        currentAudioRef.current = null;
        isPlayingRef.current = false;
        URL.revokeObjectURL(url);
        if (isActiveRef.current) {
          console.log('[Voice] Greeting done, starting to listen');
          setVoiceState('listening');
          startListeningRef.current?.();
        }
      };

      await audio.play();
    } catch (e) {
      console.error('[Voice] Greeting TTS failed:', e);
      if (isActiveRef.current) {
        setVoiceState('listening');
        startListeningRef.current?.();
      }
    }
  }, []);

  const stopVoiceMode = useCallback(() => {
    console.log('[Voice] Stopping voice mode');
    isActiveRef.current = false;
    setVoiceState('idle');
    setCurrentTranscript('');
    setAudioLevel(0);

    if (maxRecordTimerRef.current) { clearTimeout(maxRecordTimerRef.current); maxRecordTimerRef.current = null; }
    cancelAnimationFrame(animFrameRef.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    interruptAI();
    errorCountRef.current = 0;
  }, [interruptAI]);

  // Keep the ref updated
  useEffect(() => { stopVoiceModeRef.current = stopVoiceMode; }, [stopVoiceMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (maxRecordTimerRef.current) clearTimeout(maxRecordTimerRef.current);
      cancelAnimationFrame(animFrameRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (currentAudioRef.current) currentAudioRef.current.pause();
      audioQueueRef.current.forEach(a => URL.revokeObjectURL(a.src));
    };
  }, []);

  return {
    voiceState,
    isActive: voiceState !== 'idle',
    currentTranscript,
    startVoiceMode,
    stopVoiceMode,
    interruptAI,
    audioLevel,
  };
}
