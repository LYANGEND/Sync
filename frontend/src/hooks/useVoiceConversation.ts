import { useState, useRef, useCallback, useEffect } from 'react';
import masterAIService, {
  VoiceSSEEvent,
  VoiceResponseEvent,
} from '../services/masterAIService';
import toast from 'react-hot-toast';

// ================================================================
// useVoiceConversation  — Smooth, human-like voice chat hook
// ================================================================
//
// Architecture (like a natural phone call):
//
//   User speaks → MediaRecorder → Whisper transcription → text
//       ↓
//   voiceExecute SSE → AI response text (displayed immediately)
//       ↓
//   Sentence-by-sentence TTS audio chunks arrive via SSE
//       ↓
//   Audio queue plays them back-to-back with no gap
//       ↓
//   Last chunk finishes → auto-start listening again
//       ↓
//   If user said "bye" / "thank you" → farewell detected → end voice mode
//
// Key features:
//  • Sentence-pipelined TTS — first sentence plays while rest are being generated
//  • Adaptive silence detection — learns ambient noise level
//  • Audio queue — no gaps between sentences
//  • Interruption — user can speak while AI is talking to interrupt
//  • Farewell detection — "bye", "thank you", etc. gracefully end the call

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'ending';

interface VoiceConversationReturn {
  voiceState: VoiceState;
  isActive: boolean;
  currentTranscript: string;
  startVoiceMode: () => Promise<void>;
  stopVoiceMode: () => void;
  interruptAI: () => void;
  audioLevel: number; // 0–1, for visualisation
}

interface VoiceConversationOptions {
  conversationId: string | null;
  onResponse: (response: VoiceResponseEvent) => void;
  onConversationEnd: () => void;
  onError: (error: string) => void;
  onTranscript: (text: string) => void;
  onConversationIdChange: (id: string) => void;
}

// ---- Client-side farewell detection (instant, no server round-trip) ----
const FAREWELL_RE = [
  /\b(bye|goodbye|good\s?bye|bye[\s-]?bye|see\s?ya|see\s?you|later|take\s?care)\b/i,
  /\b(thank\s?you|thanks|cheers|appreciate\s*it)\b/i,
  /\b(that['']?\s*s?\s*(all|it|everything)|i['']?\s*m?\s*(done|good|finished))\b/i,
  /\b(end|stop|exit|quit)\s*(the\s*)?(call|chat|conversation|voice)\b/i,
  /\b(good\s*night|nighty?\s*night)\b/i,
];

function isClientFarewell(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length > 80) return false; // Long messages are probably not just "bye"
  return FAREWELL_RE.some(r => r.test(t));
}

export function useVoiceConversation(options: VoiceConversationOptions): VoiceConversationReturn {
  const {
    conversationId,
    onResponse,
    onConversationEnd,
    onError,
    onTranscript,
    onConversationIdChange,
  } = options;

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs for cleanup-safe access
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(conversationId);
  const errorCountRef = useRef(0);
  const noiseFloorRef = useRef(8); // Adaptive noise floor

  // Keep conversationId ref in sync
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // ---- Audio queue: play chunks back-to-back with no gap ----

  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      // All audio finished — if still active, start listening again
      if (isActiveRef.current) {
        setVoiceState('listening');
        setTimeout(() => startListeningInternal(), 300);
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

    audio.play().catch(() => {
      playNextInQueue();
    });
  }, []);

  const enqueueAudio = useCallback((base64: string, contentType: string) => {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: contentType });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audioQueueRef.current.push(audio);

    // If nothing is playing yet, start immediately
    if (!isPlayingRef.current) {
      setVoiceState('speaking');
      playNextInQueue();
    }
  }, [playNextInQueue]);

  // ---- Interrupt: stop AI audio so user can speak ----

  const interruptAI = useCallback(() => {
    // Stop current audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.onended = null;
      URL.revokeObjectURL(currentAudioRef.current.src);
      currentAudioRef.current = null;
    }
    // Clear audio queue
    audioQueueRef.current.forEach(a => URL.revokeObjectURL(a.src));
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    // Abort the SSE stream (server stops generating remaining sentences)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // ---- Microphone recording with adaptive VAD ----

  const startListeningInternal = useCallback(async () => {
    if (!isActiveRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Audio analysis for silence detection + visual level
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let silenceStart: number | null = null;
      let speechDetected = false;
      const SILENCE_DURATION = 1400; // 1.4s silence after speech = done
      const INITIAL_WAIT = 5000;     // Wait up to 5s for first speech
      const startTime = Date.now();
      let noiseFloorSamples: number[] = [];

      const checkAudio = () => {
        if (!analyserRef.current || !isActiveRef.current) return;

        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength;

        // Normalize level for UI (0–1)
        setAudioLevel(Math.min(avg / 80, 1));

        // Adaptive noise floor: sample first 500ms
        if (Date.now() - startTime < 500) {
          noiseFloorSamples.push(avg);
          if (noiseFloorSamples.length > 10) {
            noiseFloorRef.current = Math.max(
              (noiseFloorSamples.reduce((a, b) => a + b) / noiseFloorSamples.length) * 1.8,
              6,
            );
          }
        }

        const threshold = noiseFloorRef.current;

        if (avg > threshold) {
          speechDetected = true;
          silenceStart = null;
        } else {
          if (speechDetected) {
            // Speech was detected before, now silence
            if (silenceStart === null) {
              silenceStart = Date.now();
            } else if (Date.now() - silenceStart > SILENCE_DURATION) {
              // Done speaking
              stopListeningInternal();
              return;
            }
          } else if (Date.now() - startTime > INITIAL_WAIT) {
            // No speech for 5s — stop
            stopListeningInternal();
            return;
          }
        }

        animFrameRef.current = requestAnimationFrame(checkAudio);
      };

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Cleanup audio context
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        cancelAnimationFrame(animFrameRef.current);
        setAudioLevel(0);

        if (!isActiveRef.current) return;

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        // Skip very short recordings (noise/accidental)
        if (audioBlob.size < 4000) {
          if (isActiveRef.current && errorCountRef.current < 3) {
            setVoiceState('listening');
            setTimeout(() => startListeningInternal(), 500);
          }
          return;
        }

        // Transcribe
        setVoiceState('processing');
        setCurrentTranscript('');

        try {
          const text = await masterAIService.transcribeAudio(audioBlob);
          errorCountRef.current = 0;

          if (!text.trim()) {
            if (isActiveRef.current) {
              setVoiceState('listening');
              setTimeout(() => startListeningInternal(), 400);
            }
            return;
          }

          setCurrentTranscript(text);
          onTranscript(text);

          // ---- Client-side farewell detection (immediate) ----
          const isFarewell = isClientFarewell(text);

          // Send to voice-execute SSE pipeline
          sendVoiceCommand(text, isFarewell);
        } catch (err: any) {
          errorCountRef.current++;
          console.error('Transcription error:', err);

          if (errorCountRef.current >= 3) {
            onError('Audio service unavailable. Exiting voice mode.');
            stopVoiceMode();
            return;
          }

          toast.error('Failed to transcribe — please try again');
          if (isActiveRef.current) {
            setVoiceState('listening');
            const delay = Math.min(1000 * Math.pow(2, errorCountRef.current - 1), 4000);
            setTimeout(() => startListeningInternal(), delay);
          }
        }
      };

      mediaRecorder.start(250); // 250ms timeslice for smoother data collection
      setVoiceState('listening');
      checkAudio();
    } catch (err) {
      console.error('Mic error:', err);
      onError('Microphone access denied or unavailable');
      stopVoiceMode();
    }
  }, [onTranscript, onError]);

  const stopListeningInternal = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
  }, []);

  // ---- Send voice command via SSE pipeline ----

  const sendVoiceCommand = useCallback((text: string, isFarewell: boolean) => {
    setVoiceState('processing');

    let gotResponse = false;
    let shouldEnd = isFarewell; // may be reinforced by server

    const controller = masterAIService.voiceExecute(
      text,
      conversationIdRef.current || undefined,
      (event: VoiceSSEEvent) => {
        switch (event.type) {
          case 'response': {
            gotResponse = true;
            const resp = event as VoiceResponseEvent;
            onResponse(resp);

            // Track conversation ID
            if (resp.conversationId && resp.conversationId !== conversationIdRef.current) {
              conversationIdRef.current = resp.conversationId;
              onConversationIdChange(resp.conversationId);
            }

            // Server-side farewell detection
            if (resp.shouldEndConversation) {
              shouldEnd = true;
            }
            break;
          }

          case 'audio': {
            if (!isActiveRef.current) return;
            setVoiceState('speaking');
            enqueueAudio(event.audio, event.contentType);
            break;
          }

          case 'done': {
            if (event.shouldEndConversation) shouldEnd = true;

            // If no audio was sent (rare edge case), handle transition
            if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
              if (shouldEnd) {
                // Graceful end — small delay then exit
                setVoiceState('ending');
                setTimeout(() => {
                  stopVoiceMode();
                  onConversationEnd();
                }, 1500);
              } else if (isActiveRef.current) {
                setVoiceState('listening');
                setTimeout(() => startListeningInternal(), 300);
              }
            } else if (shouldEnd) {
              // Audio is playing — when it finishes the queue will call playNextInQueue,
              // which calls startListeningInternal. We need to flag that we should end instead.
              // Override: after all audio, end the conversation.
              const waitForAudioEnd = () => {
                if (isPlayingRef.current || audioQueueRef.current.length > 0) {
                  setTimeout(waitForAudioEnd, 200);
                } else {
                  setVoiceState('ending');
                  setTimeout(() => {
                    stopVoiceMode();
                    onConversationEnd();
                  }, 1000);
                }
              };
              // Flag so playNextInQueue doesn't restart listening
              isActiveRef.current = false;
              waitForAudioEnd();
            }
            break;
          }

          case 'error': {
            console.error('Voice SSE error:', event.error);
            if (!gotResponse) {
              onError(event.error);
            }
            // Try to continue listening
            if (isActiveRef.current) {
              setVoiceState('listening');
              setTimeout(() => startListeningInternal(), 500);
            }
            break;
          }
        }
      },
    );

    abortControllerRef.current = controller;
  }, [onResponse, onConversationEnd, onError, onConversationIdChange, enqueueAudio, startListeningInternal]);

  // ---- Public API ----

  const startVoiceMode = useCallback(async () => {
    isActiveRef.current = true;
    errorCountRef.current = 0;
    setVoiceState('speaking');
    setCurrentTranscript('');

    // Play a greeting
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
          setVoiceState('listening');
          startListeningInternal();
        }
      };

      await audio.play();
    } catch (e) {
      console.error('Greeting TTS failed:', e);
      // Even if greeting fails, start listening
      if (isActiveRef.current) {
        setVoiceState('listening');
        startListeningInternal();
      }
    }
  }, [startListeningInternal]);

  const stopVoiceMode = useCallback(() => {
    isActiveRef.current = false;
    setVoiceState('idle');
    setCurrentTranscript('');
    setAudioLevel(0);

    // Stop recording
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
    cancelAnimationFrame(animFrameRef.current);

    // Stop audio playback
    interruptAI();

    errorCountRef.current = 0;
  }, [interruptAI]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      audioQueueRef.current.forEach(a => URL.revokeObjectURL(a.src));
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      cancelAnimationFrame(animFrameRef.current);
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
