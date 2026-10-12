import { Loader2, Mic, Volume2, Check, PhoneOff } from 'lucide-react';
import type { useVoiceConversation } from '../../hooks/useVoiceConversation';

/** Compact floating voice-call panel shown above the chat while voice mode is on. */
export const VoicePanel = ({ voice, onEnd }: {
  voice: ReturnType<typeof useVoiceConversation>;
  onEnd: () => void;
}) => {
  if (!voice.isActive) {
    return (
      <div className="mb-3 p-6 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="text-primary animate-spin" />
          <span className="text-base font-medium text-gray-900 dark:text-white">Starting voice mode...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 relative rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 overflow-hidden">
      {/* Ambient glow inside card */}
      <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-20 transition-all duration-700"
          style={{
            width: `${160 + voice.audioLevel * 120}px`,
            height: `${160 + voice.audioLevel * 120}px`,
            background: voice.voiceState === 'listening'
              ? 'radial-gradient(circle, rgba(239,68,68,0.6), transparent)'
              : voice.voiceState === 'speaking'
              ? 'radial-gradient(circle, rgba(147,51,234,0.6), transparent)'
              : voice.voiceState === 'processing'
              ? 'radial-gradient(circle, rgba(59,130,246,0.5), transparent)'
              : 'radial-gradient(circle, rgba(100,116,139,0.3), transparent)',
          }}
        />
      </div>

      {/* Header row */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${
            voice.voiceState === 'listening' ? 'bg-red-400' :
            voice.voiceState === 'speaking' ? 'bg-purple-400' :
            voice.voiceState === 'processing' ? 'bg-blue-400' :
            voice.voiceState === 'ending' ? 'bg-emerald-400' : 'bg-slate-400'
          }`} />
          <span className="text-white/60 text-xs font-medium">Voice Conversation</span>
        </div>
      </div>

      {/* Main body — orb + state */}
      <div className="relative z-10 flex items-center gap-4 px-4 py-3">
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
            className={`rounded-full flex items-center justify-center shadow-lg transition-all duration-500 ${
              voice.voiceState === 'listening'
                ? 'bg-gradient-to-br from-red-500 to-red-600'
                : voice.voiceState === 'speaking'
                ? 'bg-gradient-to-br from-purple-500 to-purple-700'
                : voice.voiceState === 'processing'
                ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                : voice.voiceState === 'ending'
                ? 'bg-gradient-to-br from-emerald-500 to-emerald-600'
                : 'bg-gradient-to-br from-slate-600 to-slate-700'
            }`}
            style={{ width: `${48 + voice.audioLevel * 12}px`, height: `${48 + voice.audioLevel * 12}px` }}
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
          <p className={`text-sm font-semibold ${
            voice.voiceState === 'listening' ? 'text-red-400' :
            voice.voiceState === 'speaking' ? 'text-purple-400' :
            voice.voiceState === 'processing' ? 'text-blue-400' :
            voice.voiceState === 'ending' ? 'text-emerald-400' : 'text-slate-400'
          }`}>
            {voice.voiceState === 'listening' && 'Listening...'}
            {voice.voiceState === 'speaking' && 'Speaking...'}
            {voice.voiceState === 'processing' && 'Thinking...'}
            {voice.voiceState === 'ending' && 'Goodbye!'}
            {voice.voiceState === 'idle' && 'Ready'}
          </p>
          {voice.currentTranscript ? (
            <p className="text-xs text-white/50 mt-0.5 truncate italic">
              "{voice.currentTranscript}"
            </p>
          ) : (
            <p className="text-xs text-white/30 mt-0.5">
              {voice.voiceState === 'listening' && 'Speak naturally — I\'ll know when you\'re done'}
              {voice.voiceState === 'speaking' && 'Tap orb to interrupt'}
              {voice.voiceState === 'processing' && 'Processing your request...'}
              {voice.voiceState === 'ending' && 'See you!'}
              {voice.voiceState === 'idle' && 'Starting...'}
            </p>
          )}
        </div>
      </div>

      {/* Audio level bar */}
      {(voice.voiceState === 'listening' || voice.voiceState === 'speaking') && (
        <div className="relative z-10 px-4 pb-2">
          <div className="h-1 rounded-full bg-white/5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-150 ${
                voice.voiceState === 'listening' ? 'bg-red-400' : 'bg-purple-400'
              }`}
              style={{ width: `${Math.min(100, voice.audioLevel * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer — end button */}
      <div className="relative z-10 px-4 pb-3 pt-1 flex items-center justify-between">
        <p className="text-xs text-white/40">
          Say "goodbye" to end
        </p>
        <button
          onClick={onEnd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-full text-xs font-medium shadow-lg shadow-red-500/20 transition-all hover:scale-105 active:scale-95"
        >
          <PhoneOff size={12} />
          End
        </button>
      </div>
    </div>
  );
};
