import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mic, PhoneOff, Volume2, Loader2, Check, ExternalLink } from 'lucide-react';
import { useVoiceConversation, VoiceState } from '../../hooks/useVoiceConversation';
import type { VoiceResponse } from '../../hooks/useVoiceConversation';
import toast from 'react-hot-toast';

// ==================================================================
// GLOBAL VOICE COMMAND — Compact Floating Widget
// ==================================================================
// A small floating voice widget anchored to the bottom-right.
// When active it expands into a compact card (~320px wide) that
// floats above page content — the user can keep browsing, grading,
// etc. while the AI speaks. Never covers the full page.
//
// Activation: floating mic button, Ctrl+Shift+V, or "Hello Sync"

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
      // Transcript shown via voice.currentTranscript
    }, []),
    onConversationIdChange: useCallback((id: string) => {
      setConversationId(id);
    }, []),
  });

  // ---- Start voice mode ----
  const startGlobalVoice = useCallback(async () => {
    if (isOnMasterAI) {
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
  const [wakeWordActive, setWakeWordActive] = useState(false);
  const recognitionRef = useRef<any>(null);
  const wakeWordEnabledRef = useRef(true);
  const startGlobalVoiceRef = useRef(startGlobalVoice);
  useEffect(() => { startGlobalVoiceRef.current = startGlobalVoice; }, [startGlobalVoice]);

  useEffect(() => {
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

    const WAKE_PATTERNS = [
      /\bhello\s+sync\b/i,
      /\bhey\s+sync\b/i,
      /\bhi\s+sync\b/i,
      /\bsync\s+hello\b/i,
      /\bhello\s+think\b/i,
      /\bhey\s+think\b/i,
      /\bhello\s+sink\b/i,
      /\bhey\s+sink\b/i,
    ];

    let cooldown = false;

    recognition.onresult = (event: any) => {
      if (cooldown || !wakeWordEnabledRef.current) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        for (let alt = 0; alt < event.results[i].length; alt++) {
          const transcript = event.results[i][alt].transcript.trim();
          const matched = WAKE_PATTERNS.some(p => p.test(transcript));
          if (matched) {
            console.log(`[WakeWord] Detected! Transcript: "${transcript}"`);
            cooldown = true;
            try { recognition.stop(); } catch (_) {}
            setTimeout(() => {
              startGlobalVoiceRef.current();
            }, 300);
            return;
          }
        }
      }
    };

    recognition.onstart = () => { setWakeWordActive(true); };
    recognition.onend = () => {
      setWakeWordActive(false);
      if (wakeWordEnabledRef.current) {
        setTimeout(() => { try { recognition.start(); } catch (_) {} }, 500);
      }
    };
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.log(`[WakeWord] Error: ${event.error}`);
      if (event.error === 'not-allowed') {
        wakeWordEnabledRef.current = false;
        setWakeWordActive(false);
      }
    };

    try { recognition.start(); } catch (_) {}
    return () => {
      wakeWordEnabledRef.current = false;
      try { recognition.stop(); } catch (_) {}
    };
  }, []);

  // Pause wake word during voice mode, resume after
  useEffect(() => {
    if (isOpen) {
      wakeWordEnabledRef.current = false;
      try { recognitionRef.current?.stop(); } catch (_) {}
    } else {
      const timer = setTimeout(() => {
        wakeWordEnabledRef.current = true;
        try { recognitionRef.current?.start(); } catch (_) {}
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Don't render on Master AI page
  if (isOnMasterAI) return null;

  // ---- Derived display values ----
  const orbSize = 48 + voice.audioLevel * 12; // 48–60px
  const stateColor = getStateColor(voice.voiceState);

  return (
    <>
      {/* ============== FLOATING MIC BUTTON (idle) ============== */}
      {!isOpen && (
        <button
          onClick={startGlobalVoice}
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 group"
          title='Say "Hello Sync" or press Ctrl+Shift+V'
          aria-label="Start voice command"
        >
          <div className="relative">
            {pulseHint && (
              <div className="absolute inset-0 rounded-full bg-purple-500 animate-ping opacity-20" />
            )}
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg shadow-purple-500/30 flex items-center justify-center text-white transition-all duration-200 hover:scale-110 hover:shadow-xl hover:shadow-purple-500/40 active:scale-95">
              <Mic size={24} />
            </div>
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

      {/* ============== FLOATING VOICE WIDGET (active) ============== */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-[100] w-[320px] animate-in slide-in-from-bottom-4 fade-in duration-300">
          {/* Glass card */}
          <div className="relative rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-white/10 shadow-2xl shadow-purple-500/10 overflow-hidden">

            {/* Ambient glow behind card */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-20 transition-all duration-700"
                style={{
                  width: `${160 + voice.audioLevel * 120}px`,
                  height: `${160 + voice.audioLevel * 120}px`,
                  background: getGlowGradient(voice.voiceState),
                }}
              />
            </div>

            {/* Header row */}
            <div className="relative z-10 flex items-center justify-between px-4 pt-3 pb-1">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${stateColor.dot} animate-pulse`} />
                <span className="text-white/60 text-xs font-medium">Master AI Voice</span>
              </div>
              <button
                onClick={openFullChat}
                className="text-white/40 hover:text-white/70 transition-colors"
                title="Open full chat"
              >
                <ExternalLink size={14} />
              </button>
            </div>

            {/* Main body — orb + state */}
            <div className="relative z-10 flex items-center gap-3 px-4 py-3">
              {/* Mini orb — tappable to interrupt when speaking */}
              <button
                onClick={() => { if (voice.voiceState === 'speaking') voice.interruptAI(); }}
                className="relative flex-shrink-0"
                title={voice.voiceState === 'speaking' ? 'Tap to interrupt' : undefined}
              >
                {/* Pulse ring */}
                {(voice.voiceState === 'listening' || voice.voiceState === 'speaking') && (
                  <div
                    className={`absolute inset-0 rounded-full animate-ping opacity-20 ${
                      voice.voiceState === 'listening' ? 'bg-red-400' : 'bg-purple-400'
                    }`}
                    style={{ animationDuration: '2s' }}
                  />
                )}
                <div
                  className={`rounded-full flex items-center justify-center shadow-lg transition-all duration-500 ${getOrbClasses(voice.voiceState)}`}
                  style={{ width: `${orbSize}px`, height: `${orbSize}px` }}
                >
                  {voice.voiceState === 'listening' && <Mic size={22} className="text-white drop-shadow" />}
                  {voice.voiceState === 'speaking' && <Volume2 size={22} className="text-white drop-shadow animate-pulse" />}
                  {voice.voiceState === 'processing' && <Loader2 size={22} className="text-white drop-shadow animate-spin" />}
                  {voice.voiceState === 'ending' && <Check size={22} className="text-white drop-shadow" />}
                  {voice.voiceState === 'idle' && <Mic size={22} className="text-white/60 drop-shadow" />}
                </div>
              </button>

              {/* State text + transcript */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${stateColor.text}`}>
                  {getStateLabel(voice.voiceState)}
                </p>
                {voice.currentTranscript ? (
                  <p className="text-xs text-white/50 mt-0.5 truncate italic">
                    "{voice.currentTranscript}"
                  </p>
                ) : (
                  <p className="text-xs text-white/30 mt-0.5">
                    {getStateHint(voice.voiceState)}
                  </p>
                )}
              </div>
            </div>

            {/* AI response preview */}
            {lastResponse && voice.voiceState !== 'processing' && (
              <div className="relative z-10 px-4 pb-2">
                <p className="text-xs text-white/40 leading-relaxed line-clamp-2">
                  {lastResponse.slice(0, 120)}{lastResponse.length > 120 ? '...' : ''}
                </p>
              </div>
            )}

            {/* Audio level bar */}
            {(voice.voiceState === 'listening' || voice.voiceState === 'speaking') && (
              <div className="relative z-10 px-4 pb-2">
                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-150 ${stateColor.bar}`}
                    style={{ width: `${Math.min(100, voice.audioLevel * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Footer — end button */}
            <div className="relative z-10 px-4 pb-3 pt-1 flex items-center justify-between">
              <p className="text-[10px] text-white/20">
                Say "goodbye" to end
              </p>
              <button
                onClick={stopGlobalVoice}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-full text-xs font-medium shadow-lg shadow-red-500/20 transition-all hover:scale-105 active:scale-95"
              >
                <PhoneOff size={12} />
                End
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ---- Helper functions ----

function getGlowGradient(state: VoiceState): string {
  switch (state) {
    case 'listening': return 'radial-gradient(circle, rgba(239,68,68,0.6), transparent)';
    case 'speaking': return 'radial-gradient(circle, rgba(147,51,234,0.6), transparent)';
    case 'processing': return 'radial-gradient(circle, rgba(59,130,246,0.5), transparent)';
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

function getStateColor(state: VoiceState): { dot: string; text: string; bar: string } {
  switch (state) {
    case 'listening': return { dot: 'bg-red-400', text: 'text-red-400', bar: 'bg-red-400' };
    case 'speaking': return { dot: 'bg-purple-400', text: 'text-purple-400', bar: 'bg-purple-400' };
    case 'processing': return { dot: 'bg-blue-400', text: 'text-blue-400', bar: 'bg-blue-400' };
    case 'ending': return { dot: 'bg-emerald-400', text: 'text-emerald-400', bar: 'bg-emerald-400' };
    default: return { dot: 'bg-slate-400', text: 'text-slate-400', bar: 'bg-slate-400' };
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

function getStateHint(state: VoiceState): string {
  switch (state) {
    case 'listening': return 'Speak naturally';
    case 'speaking': return 'Tap orb to interrupt';
    case 'processing': return 'Processing...';
    case 'ending': return 'See you!';
    default: return 'Starting up...';
  }
}

export default GlobalVoiceCommand;
