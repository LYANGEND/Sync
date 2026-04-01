import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mic, PhoneOff, Volume2, Loader2, Check } from 'lucide-react';
import { useVoiceConversation, VoiceState } from '../../hooks/useVoiceConversation';
import type { VoiceResponse } from '../../hooks/useVoiceConversation';
import toast from 'react-hot-toast';

// ==================================================================
// GLOBAL VOICE COMMAND
// ==================================================================
// A floating microphone button + keyboard shortcut (Ctrl+Shift+V)
// + wake word "Hello Sync" that works from ANY page.
// When activated, it shows a full-screen voice overlay on top
// of everything — no navigation required.
//
// The conversation is self-contained: it creates its own conversation
// context and handles everything internally.
//
// WAKE WORD: Uses the browser's SpeechRecognition API (free, local)
// to continuously listen for "Hello Sync" / "Hey Sync". When
// detected, automatically opens voice mode. Pauses while voice
// mode is active to avoid mic conflicts.

const GlobalVoiceCommand = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<string>('');
  const [pulseHint, setPulseHint] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  // Hide on the Master AI page itself (it has its own voice mode)
  const isOnMasterAI = location.pathname === '/ai' || location.pathname === '/master-ai';

  // ---- Voice conversation hook ----
  const voice = useVoiceConversation({
    conversationId,
    onResponse: useCallback((resp: VoiceResponse) => {
      setLastResponse(resp.message);
      if (resp.conversationId) {
        setConversationId(resp.conversationId);
      }
    }, []),
    onConversationEnd: useCallback(() => {
      // Graceful farewell — close overlay after a brief pause
      setTimeout(() => {
        setIsOpen(false);
        setConversationId(null);
        setLastResponse('');
      }, 800);
    }, []),
    onError: useCallback((error: string) => {
      toast.error(error);
    }, []),
    onTranscript: useCallback((_text: string) => {
      // Transcript is shown in the overlay via voice.currentTranscript
    }, []),
    onConversationIdChange: useCallback((id: string) => {
      setConversationId(id);
    }, []),
  });

  // ---- Start voice mode ----
  const startGlobalVoice = useCallback(async () => {
    if (isOnMasterAI) {
      // On Master AI page, don't open global overlay — let the page handle it
      toast('Use the voice button in the chat to start voice mode', { icon: '🎙️' });
      return;
    }
    setPulseHint(false);
    setIsOpen(true);
    setConversationId(null);
    setLastResponse('');
    await voice.startVoiceMode();
  }, [isOnMasterAI, voice]);

  // ---- Stop voice mode ----
  const stopGlobalVoice = useCallback(() => {
    voice.stopVoiceMode();
    setIsOpen(false);
    setConversationId(null);
    setLastResponse('');
  }, [voice]);

  // ---- Keyboard shortcut: Ctrl+Shift+V ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        if (isOpen) {
          stopGlobalVoice();
        } else {
          startGlobalVoice();
        }
      }
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        stopGlobalVoice();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, startGlobalVoice, stopGlobalVoice]);

  // ---- Navigate to full Master AI chat ----
  const openFullChat = useCallback(() => {
    const convId = conversationId;
    stopGlobalVoice();
    navigate('/ai' + (convId ? `?conversation=${convId}` : ''));
  }, [conversationId, stopGlobalVoice, navigate]);

  // ==================================================================
  // WAKE WORD DETECTION — "Hello Sync" / "Hey Sync"
  // ==================================================================
  // Uses the browser's free SpeechRecognition API for always-on
  // lightweight wake word listening. No audio is sent to our servers
  // until the wake word is detected and voice mode starts.
  const [wakeWordActive, setWakeWordActive] = useState(false);
  const recognitionRef = useRef<any>(null);
  const wakeWordEnabledRef = useRef(true);
  const startGlobalVoiceRef = useRef(startGlobalVoice);
  useEffect(() => { startGlobalVoiceRef.current = startGlobalVoice; }, [startGlobalVoice]);

  useEffect(() => {
    // Check browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.log('[WakeWord] SpeechRecognition not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3;

    // Wake word patterns — matches "hello sync", "hey sync", "hi sync"
    const WAKE_PATTERNS = [
      /\bhello\s+sync\b/i,
      /\bhey\s+sync\b/i,
      /\bhi\s+sync\b/i,
      /\bsync\s+hello\b/i,
      /\bhello\s+think\b/i,    // common misrecognition
      /\bhey\s+think\b/i,
      /\bhello\s+sink\b/i,     // another misrecognition
      /\bhey\s+sink\b/i,
    ];

    let cooldown = false;

    recognition.onresult = (event: any) => {
      if (cooldown || !wakeWordEnabledRef.current) return;

      // Check latest results for the wake phrase
      for (let i = event.resultIndex; i < event.results.length; i++) {
        // Check all alternatives for better accuracy
        for (let alt = 0; alt < event.results[i].length; alt++) {
          const transcript = event.results[i][alt].transcript.trim();
          const matched = WAKE_PATTERNS.some(p => p.test(transcript));
          if (matched) {
            console.log(`[WakeWord] Detected! Transcript: "${transcript}"`);
            cooldown = true;

            // Stop recognition before starting voice mode (avoid mic conflict)
            try { recognition.stop(); } catch (_) {}

            // Small delay so the mic is released before voice mode grabs it
            setTimeout(() => {
              startGlobalVoiceRef.current();
              // Cooldown resets when voice mode ends (see below)
            }, 300);
            return;
          }
        }
      }
    };

    recognition.onstart = () => {
      setWakeWordActive(true);
    };

    recognition.onend = () => {
      setWakeWordActive(false);
      // Auto-restart if still enabled and not in voice mode
      if (wakeWordEnabledRef.current) {
        setTimeout(() => {
          try { recognition.start(); } catch (_) {}
        }, 500);
      }
    };

    recognition.onerror = (event: any) => {
      // 'no-speech' and 'aborted' are normal — just restart
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.log(`[WakeWord] Error: ${event.error}`);
      // 'not-allowed' means mic permission denied — stop trying
      if (event.error === 'not-allowed') {
        wakeWordEnabledRef.current = false;
        setWakeWordActive(false);
      }
    };

    // Start listening for the wake word
    try { recognition.start(); } catch (_) {}

    return () => {
      wakeWordEnabledRef.current = false;
      try { recognition.stop(); } catch (_) {}
    };
  }, []);

  // Pause wake word during voice mode, resume after
  useEffect(() => {
    if (isOpen) {
      // Voice mode active — pause wake word listening
      wakeWordEnabledRef.current = false;
      try { recognitionRef.current?.stop(); } catch (_) {}
    } else {
      // Voice mode ended — resume wake word listening after a delay
      const timer = setTimeout(() => {
        wakeWordEnabledRef.current = true;
        try { recognitionRef.current?.start(); } catch (_) {}
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Don't render on Master AI page
  if (isOnMasterAI) return null;

  return (
    <>
      {/* ============== FLOATING MIC BUTTON ============== */}
      {!isOpen && (
        <button
          onClick={startGlobalVoice}
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 group"
          title='Say "Hello Sync" or press Ctrl+Shift+V'
          aria-label="Start voice command"
        >
          <div className="relative">
            {/* Pulse ring hint (shown on first load) */}
            {pulseHint && (
              <div className="absolute inset-0 rounded-full bg-purple-500 animate-ping opacity-20" />
            )}
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg shadow-purple-500/30 flex items-center justify-center text-white transition-all duration-200 hover:scale-110 hover:shadow-xl hover:shadow-purple-500/40 active:scale-95">
              <Mic size={24} />
            </div>
            {/* Wake word active indicator — tiny green dot */}
            {wakeWordActive && (
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-white dark:border-slate-900 shadow-sm" />
            )}
            {/* Tooltip */}
            <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
              <span className="font-medium">"Hello Sync"</span>
              <span className="text-white/40 mx-1.5">or</span>
              <span className="text-white/50">Ctrl+Shift+V</span>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-2 h-2 bg-slate-800 rotate-45" />
            </div>
          </div>
        </button>
      )}

      {/* ============== FULL-SCREEN VOICE OVERLAY ============== */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] bg-gradient-to-b from-slate-900 via-purple-950 to-slate-900 flex flex-col items-center justify-center">
          {/* Ambient glow */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-30 transition-all duration-700"
              style={{
                width: `${200 + voice.audioLevel * 300}px`,
                height: `${200 + voice.audioLevel * 300}px`,
                background: getGlowGradient(voice.voiceState),
              }}
            />
          </div>

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 safe-area-top">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white/60 text-sm font-medium">Master AI Voice</span>
            </div>
            <button
              onClick={openFullChat}
              className="text-white/50 hover:text-white/80 text-xs px-3 py-1.5 rounded-full border border-white/20 hover:border-white/40 transition-all"
            >
              Open Full Chat →
            </button>
          </div>

          {/* Central orb */}
          <div className="relative z-10 flex flex-col items-center gap-6">
            <div
              className="relative rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                width: `${100 + voice.audioLevel * 40}px`,
                height: `${100 + voice.audioLevel * 40}px`,
              }}
            >
              {/* Pulsing ring */}
              {(voice.voiceState === 'listening' || voice.voiceState === 'speaking') && (
                <div
                  className={`absolute inset-0 rounded-full animate-ping opacity-20 ${
                    voice.voiceState === 'listening' ? 'bg-red-400' : 'bg-purple-400'
                  }`}
                  style={{ animationDuration: '2s' }}
                />
              )}
              {/* Inner orb */}
              <div className={`w-full h-full rounded-full flex items-center justify-center shadow-2xl transition-colors duration-500 ${getOrbClasses(voice.voiceState)}`}>
                {voice.voiceState === 'listening' && <Mic size={44} className="text-white drop-shadow-lg" />}
                {voice.voiceState === 'speaking' && <Volume2 size={44} className="text-white drop-shadow-lg animate-pulse" />}
                {voice.voiceState === 'processing' && <Loader2 size={44} className="text-white drop-shadow-lg animate-spin" />}
                {voice.voiceState === 'ending' && <Check size={44} className="text-white drop-shadow-lg" />}
                {voice.voiceState === 'idle' && <Mic size={44} className="text-white/60 drop-shadow-lg" />}
              </div>
            </div>

            {/* State label */}
            <div className="text-center">
              <p className="text-lg font-semibold text-white">
                {getStateLabel(voice.voiceState)}
              </p>
              <p className="text-sm text-white/50 mt-1 max-w-xs text-center">
                {getStateSubtitle(voice.voiceState)}
              </p>
            </div>

            {/* Transcript preview */}
            {voice.currentTranscript && (
              <div className="mt-2 px-5 py-3 bg-white/10 backdrop-blur-sm rounded-2xl max-w-sm">
                <p className="text-white/80 text-sm italic text-center">
                  "{voice.currentTranscript}"
                </p>
              </div>
            )}

            {/* Last AI response preview */}
            {lastResponse && voice.voiceState !== 'processing' && (
              <div className="mt-1 px-5 py-2 max-w-md">
                <p className="text-white/40 text-xs text-center line-clamp-2">
                  {lastResponse.slice(0, 150)}{lastResponse.length > 150 ? '...' : ''}
                </p>
              </div>
            )}
          </div>

          {/* Interrupt button (invisible overlay on the orb when speaking) */}
          {voice.voiceState === 'speaking' && (
            <button
              onClick={() => voice.interruptAI()}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full z-20 opacity-0 cursor-pointer"
              title="Tap to interrupt"
            />
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-8 z-10 flex flex-col items-center gap-3">
            <button
              onClick={stopGlobalVoice}
              className="flex items-center gap-3 px-8 py-4 bg-red-500/90 hover:bg-red-600 text-white rounded-full text-base font-medium shadow-xl shadow-red-500/30 transition-all hover:scale-105 active:scale-95"
            >
              <PhoneOff size={22} />
              End Conversation
            </button>
            <p className="text-white/30 text-xs">
              Say "goodbye" to end • <span className="text-white/40">Esc</span> to close • Say <span className="text-white/40">"Hello Sync"</span> next time
            </p>
          </div>
        </div>
      )}
    </>
  );
};

// ---- Helper functions ----

function getGlowGradient(state: VoiceState): string {
  switch (state) {
    case 'listening': return 'radial-gradient(circle, rgba(239,68,68,0.5), transparent)';
    case 'speaking': return 'radial-gradient(circle, rgba(147,51,234,0.5), transparent)';
    case 'processing': return 'radial-gradient(circle, rgba(59,130,246,0.4), transparent)';
    default: return 'radial-gradient(circle, rgba(100,116,139,0.3), transparent)';
  }
}

function getOrbClasses(state: VoiceState): string {
  switch (state) {
    case 'listening': return 'bg-gradient-to-br from-red-500 to-red-600';
    case 'speaking': return 'bg-gradient-to-br from-purple-500 to-purple-700';
    case 'processing': return 'bg-gradient-to-br from-blue-500 to-indigo-600';
    case 'ending': return 'bg-gradient-to-br from-emerald-500 to-emerald-600';
    default: return 'bg-gradient-to-br from-slate-600 to-slate-700';
  }
}

function getStateLabel(state: VoiceState): string {
  switch (state) {
    case 'listening': return 'Listening...';
    case 'speaking': return 'Speaking...';
    case 'processing': return 'Thinking...';
    case 'ending': return 'Goodbye!';
    default: return 'Ready';
  }
}

function getStateSubtitle(state: VoiceState): string {
  switch (state) {
    case 'listening': return "Speak naturally — I'll know when you're done";
    case 'speaking': return 'Tap the orb to interrupt me';
    case 'processing': return 'Processing your request...';
    case 'ending': return 'It was great talking to you!';
    default: return 'Starting...';
  }
}

export default GlobalVoiceCommand;
