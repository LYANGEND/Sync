import { useState, useRef, useCallback, useEffect } from 'react';
import masterAIService from '../services/masterAIService';
import type { MasterAIAction } from '../services/masterAIService';
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

  // Cached greeting audio — generated once, reused on every activation
  const greetingBlobRef = useRef<Blob | null>(null);
  const greetingPrefetchedRef = useRef(false);

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
        setTimeout(() => startListeningRef.current?.(), 100);
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
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Request higher quality where supported
          sampleRate: { ideal: 16000 },
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // ---- Noise-cancellation audio processing chain ----
      // ── Audio processing chain ──────────────────────────────────
      // Bandpass (85Hz–8kHz) → gentle compressor → gain → recorder
      // NOTE: The old "noise gate" compressor (-50dB, 12:1) was
      // squashing ALL audio (speech + silence) since DynamicsCompressor
      // compresses ABOVE threshold — destroying dynamic range and
      // breaking silence detection. Removed.
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);

      // 1) High-pass filter — removes low-frequency rumble (fans, AC, traffic)
      const highPass = audioCtx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 85;  // Cut below 85 Hz (speech starts ~100 Hz)
      highPass.Q.value = 0.7;

      // 2) Low-pass filter — removes high-frequency hiss (above speech range)
      const lowPass = audioCtx.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = 8000; // Speech tops out ~7-8 kHz
      lowPass.Q.value = 0.7;

      // 3) Gentle speech compressor — evens out loud/soft speech without
      //    destroying the silence-vs-speech dynamic range
      const speechComp = audioCtx.createDynamicsCompressor();
      speechComp.threshold.value = -20; // Only compress louder speech
      speechComp.knee.value = 12;
      speechComp.ratio.value = 3;       // Gentle — preserves dynamics
      speechComp.attack.value = 0.005;
      speechComp.release.value = 0.15;

      // 4) Output gain — slight boost for Whisper clarity
      const outputGain = audioCtx.createGain();
      outputGain.gain.value = 1.1;

      // Analyser for level monitoring / silence detection
      // Connected BEFORE gain so we measure the true signal level
      const analyser = audioCtx.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;

      // Chain: source → highPass → lowPass → speechComp → analyser → outputGain
      source.connect(highPass);
      highPass.connect(lowPass);
      lowPass.connect(speechComp);
      speechComp.connect(analyser);
      analyser.connect(outputGain);

      // Create a clean processed stream for the MediaRecorder
      const destNode = audioCtx.createMediaStreamDestination();
      outputGain.connect(destNode);

      const processedStream = destNode.stream;

      const mediaRecorder = new MediaRecorder(processedStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus' : 'audio/webm',
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      console.log('[Voice] Audio chain: HighPass(85Hz) → LowPass(8kHz) → Compressor(-20dB/3:1) → Analyser → Gain(1.1)');

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // ---- Silence detection state (all in local closure) ----
      let speechDetected = false;
      let silenceStartTime: number | null = null;
      let debugCounter = 0;  // Log every ~30 frames for debugging
      const SILENCE_THRESHOLD = 15;         // RMS from time-domain data
      const SILENCE_AFTER_SPEECH = 1000;    // 1s — snappy turn-taking
      const MAX_WAIT_FOR_SPEECH = 4000;     // 4s — give user time to start talking
      const MAX_RECORDING = 15000;          // 15s hard cap — voice commands are short
      const recordStartTime = Date.now();

      // Safety net: hard max recording
      maxRecordTimerRef.current = setTimeout(() => {
        console.log('[Voice] Max recording reached (15s), stopping');
        doStopRecording();
      }, MAX_RECORDING);

      const checkAudio = () => {
        if (!analyserRef.current || !isActiveRef.current) return;

        // Use TIME-DOMAIN data for silence detection (much better
        // than frequency data — gives clean 0-centered waveform)
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = (dataArray[i] - 128) / 128; // Normalize to -1..1
          sum += v * v;
        }
        const rms = Math.sqrt(sum / bufferLength) * 100; // Scale to 0-100 range

        setAudioLevel(Math.min(rms / 40, 1));
        const now = Date.now();

        // Debug: log RMS every ~0.5s so we can see actual levels
        if (++debugCounter % 30 === 0) {
          console.log(`[Voice] RMS: ${rms.toFixed(1)}, speech: ${speechDetected}, threshold: ${SILENCE_THRESHOLD}`);
        }

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
            setTimeout(() => startListeningRef.current?.(), 200);
          }
          return;
        }

        // 🔔 Instant confirmation tone — fills the silence gap while
        // Whisper transcribes (ElevenLabs-style perceived latency fix)
        playProcessingTone();

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
              setTimeout(() => startListeningRef.current?.(), 150);
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
  // PROCESSING TONE — instant audio feedback via Web Audio API
  // ==================================================================
  // A short, warm confirmation tone that plays immediately when the
  // user finishes speaking, before transcription even starts. This
  // eliminates perceived dead silence (ElevenLabs-style).
  const playProcessingTone = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      // Pleasant rising two-note chime (C5 → E5)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, ctx.currentTime);         // C5
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.08);  // E5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);

      // Clean up
      setTimeout(() => ctx.close().catch(() => {}), 300);
    } catch { /* non-critical — older browsers */ }
  }, []);

  // ==================================================================
  // SEND VOICE COMMAND — Two-phase streaming pipeline
  // ==================================================================
  // Uses the ElevenLabs-inspired voiceExecuteV2 SSE endpoint:
  //   1. AI planning call completes → backend streams "quick" message
  //      ("Let me check...") → frontend starts TTS immediately
  //   2. Tools execute + summarizer runs → backend streams "result"
  //      → frontend queues TTS for the actual answer
  //   3. Audio queue plays quick filler → seamless transition → answer
  //
  // For no-tool queries: only "result" arrives, so latency is the same
  // as before. For tool queries: first audio plays ~2-3s sooner.
  // ==================================================================
  const sendVoiceCommandImpl = useCallback(async (text: string, isFarewell: boolean) => {
    console.log('[Voice] Sending voice command via streaming pipeline...');
    setVoiceState('processing');

    try {
      // Track whether we've received the result phase
      let gotResult = false;
      let shouldEnd = isFarewell;
      let resultMessage = '';
      let resolveStream: () => void;
      const streamDone = new Promise<void>((resolve) => { resolveStream = resolve; });

      const abortController = masterAIService.voiceExecuteStream(
        text,
        conversationIdRef.current || undefined,
        (event) => {
          if (!isActiveRef.current) return;

          // ---- PHASE 1: Quick filler message ----
          if (event.type === 'quick' && 'message' in event && event.message) {
            console.log('[Voice] Quick filler:', event.message);
            setVoiceState('speaking');

            // Start TTS for the filler immediately
            const sentences = splitIntoSentences(event.message);
            for (const sentence of sentences) {
              masterAIService.generateSpeech(sentence)
                .then(blob => {
                  if (!blob || !isActiveRef.current) return;
                  const url = URL.createObjectURL(blob);
                  const audio = new Audio(url);
                  audio.preload = 'auto';
                  audioQueueRef.current.push(audio);
                  if (!isPlayingRef.current) {
                    isPlayingRef.current = true;
                    playNextInQueue();
                  }
                })
                .catch(err => console.warn('[Voice] Quick TTS failed:', err));
            }
          }

          // ---- PHASE 2: Final result ----
          if (event.type === 'result' && 'message' in event) {
            gotResult = true;
            const resp = event as any;
            resultMessage = resp.message || '';

            console.log('[Voice] Got result:', resultMessage.slice(0, 60));

            // Notify parent
            optionsRef.current.onResponse({
              type: 'response',
              message: resp.message,
              actions: resp.actions || [],
              suggestions: resp.suggestions,
              conversationId: resp.conversationId,
              isNewConversation: resp.isNewConversation,
              shouldEndConversation: resp.shouldEndConversation,
            });

            // Track conversation ID
            if (resp.conversationId && resp.conversationId !== conversationIdRef.current) {
              conversationIdRef.current = resp.conversationId;
              optionsRef.current.onConversationIdChange(resp.conversationId);
            }

            if (resp.shouldEndConversation) shouldEnd = true;
            if (isAIFarewell(resultMessage)) shouldEnd = true;

            // Queue TTS for the final answer
            setVoiceState('speaking');
            const sentences = splitIntoSentences(resultMessage);
            console.log(`[Voice] Result split into ${sentences.length} sentences for TTS`);

            const ttsPromises = sentences.map((sentence, index) =>
              masterAIService.generateSpeech(sentence)
                .then(blob => ({ blob, index, ok: true as const }))
                .catch(err => {
                  console.warn(`[Voice] TTS failed for sentence ${index}:`, err);
                  return { blob: null, index, ok: false as const };
                })
            );

            const results = new Array<{ blob: Blob | null; ok: boolean }>(sentences.length);
            let nextToEnqueue = 0;

            const inFlightPromises = ttsPromises.map(async (promise, idx) => {
              const result = await promise;
              results[idx] = { blob: result.ok ? result.blob : null, ok: result.ok };
              while (nextToEnqueue < results.length && results[nextToEnqueue] !== undefined) {
                const r = results[nextToEnqueue];
                if (r.ok && r.blob && isActiveRef.current) {
                  const url = URL.createObjectURL(r.blob);
                  const audio = new Audio(url);
                  audio.preload = 'auto';
                  audioQueueRef.current.push(audio);
                  if (!isPlayingRef.current) {
                    isPlayingRef.current = true;
                    playNextInQueue();
                  }
                }
                nextToEnqueue++;
              }
            });

            Promise.all(inFlightPromises).catch(() => {});
          }

          // ---- DONE ----
          if (event.type === 'done') {
            console.log('[Voice] Stream complete');
            resolveStream!();
          }

          // ---- ERROR ----
          if (event.type === 'error') {
            console.error('[Voice] Stream error:', (event as any).error);
            resolveStream!();
          }
        },
      );

      // Wait for the stream to complete
      await streamDone;

      // If no result was received (error case), fall back to normal endpoint
      if (!gotResult && isActiveRef.current) {
        console.log('[Voice] No result from stream, falling back to normal endpoint');
        abortController.abort();
        const response = await masterAIService.executeCommand(text, conversationIdRef.current || undefined);
        resultMessage = response.message || '';

        optionsRef.current.onResponse({
          type: 'response',
          message: response.message,
          actions: response.actions,
          suggestions: response.suggestions,
          conversationId: response.conversationId,
          isNewConversation: response.isNewConversation,
          shouldEndConversation: response.shouldEndConversation,
        });

        if (response.conversationId && response.conversationId !== conversationIdRef.current) {
          conversationIdRef.current = response.conversationId;
          optionsRef.current.onConversationIdChange(response.conversationId);
        }

        if (response.shouldEndConversation) shouldEnd = true;
        if (isAIFarewell(resultMessage)) shouldEnd = true;

        setVoiceState('speaking');
        const sentences = splitIntoSentences(resultMessage);
        for (const sentence of sentences) {
          try {
            const blob = await masterAIService.generateSpeech(sentence);
            if (!blob || !isActiveRef.current) break;
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.preload = 'auto';
            audioQueueRef.current.push(audio);
            if (!isPlayingRef.current) {
              isPlayingRef.current = true;
              playNextInQueue();
            }
          } catch { /* skip failed sentence */ }
        }
      }

      // Handle farewell / end of conversation
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
  }, [playNextInQueue, playProcessingTone]);

  // Keep the ref updated
  useEffect(() => { sendVoiceCommandRef.current = sendVoiceCommandImpl; }, [sendVoiceCommandImpl]);

  // ==================================================================
  // PUBLIC API
  // ==================================================================
  const GREETING = "Hi! How can I help?";

  // Pre-fetch greeting audio on first mount so it's instant
  useEffect(() => {
    if (!greetingPrefetchedRef.current) {
      greetingPrefetchedRef.current = true;
      masterAIService.generateSpeech(GREETING)
        .then(blob => { if (blob) greetingBlobRef.current = blob; })
        .catch(() => { /* Non-critical — will fetch on-demand */ });
    }
  }, []);

  const startVoiceMode = useCallback(async () => {
    isActiveRef.current = true;
    errorCountRef.current = 0;
    setVoiceState('speaking');
    setCurrentTranscript('');

    try {
      // Use cached greeting if available, otherwise fetch
      const blob = greetingBlobRef.current || await masterAIService.generateSpeech(GREETING);
      if (blob && !greetingBlobRef.current) greetingBlobRef.current = blob;

      if (blob) {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.preload = 'auto';
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
      } else {
        // TTS unavailable — skip greeting and start listening immediately
        if (isActiveRef.current) {
          setVoiceState('listening');
          startListeningRef.current?.();
        }
      }
    } catch (e) {
      console.error('[Voice] Greeting TTS failed:', e);
      // Skip greeting entirely — just start listening immediately
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
