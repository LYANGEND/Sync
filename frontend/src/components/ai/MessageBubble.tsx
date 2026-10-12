import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { Sparkles, Loader2, ChevronRight, Copy, Volume2, Square, AlertTriangle } from 'lucide-react';
import { ActionResult } from './ActionResult';
import type { ChatMessage, PendingState } from './masterAITypes';

const PENDING_STATE_TEXT: Record<Exclude<PendingState, 'open'>, string> = {
  running: 'Running...',
  done: 'Confirmed.',
  cancelled: 'Cancelled. Nothing was changed.',
  failed: 'Not completed. See the message below.',
  closed: 'No longer waiting for confirmation. Ask again if this still needs doing.',
};

export const MessageBubble = ({
  message,
  onSuggestionClick,
  onTogglePlay,
  isSpeaking,
  onResolvePending,
  busy,
}: {
  message: ChatMessage;
  onSuggestionClick: (cmd: string) => void;
  onTogglePlay: () => void;
  isSpeaking: boolean;
  onResolvePending: (accept: boolean) => void;
  busy: boolean;
}) => {
  const isUser = message.role === 'user';
  const time = message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (message.isLoading) {
    return (
      <div className="flex gap-3" role="status">
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--primary-color) 12%, transparent)' }}>
          <Sparkles size={16} className="text-primary" />
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 size={14} className="animate-spin text-primary" />
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex gap-2 md:gap-3 justify-end">
        <div className="max-w-[90%] md:max-w-[85%] text-white bg-primary rounded-2xl rounded-br-md px-3 md:px-4 py-2.5 md:py-3 shadow-sm">
          {message.image && (
            <img src={message.image} alt="User upload" className="rounded-lg mb-2 max-w-full max-h-48 md:max-h-60 object-cover border border-white/30" />
          )}
          {message.content && (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
          )}
          <p className="text-xs text-white/70 mt-1">{time}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 md:gap-3">
      <div className="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1" style={{ backgroundColor: 'color-mix(in srgb, var(--primary-color) 12%, transparent)' }}>
        <Sparkles size={14} className="md:w-4 md:h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0 space-y-2 md:space-y-3">
        {/* Message Text */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-md px-3 md:px-4 py-2.5 md:py-3 border border-gray-200 dark:border-slate-700 inline-block max-w-[90%] md:max-w-[85%]">
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-gray-900 dark:text-white leading-relaxed">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
          {message.errorDetail && (
            <details className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              <summary className="cursor-pointer select-none">Details</summary>
              <p className="mt-1 break-words">{message.errorDetail}</p>
            </details>
          )}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700 flex-wrap text-xs text-gray-400">
            <button
              onClick={onTogglePlay}
              className="flex items-center gap-1 hover:text-primary transition-colors"
              aria-label={isSpeaking ? 'Stop reading aloud' : 'Read aloud'}
              aria-pressed={isSpeaking}
            >
              {isSpeaking ? <Square size={12} /> : <Volume2 size={12} />}
              {isSpeaking ? 'Stop' : 'Read aloud'}
            </button>
            <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">•</span>
            <button
              onClick={() => { navigator.clipboard.writeText(message.content); toast.success('Copied'); }}
              className="flex items-center gap-1 hover:text-primary transition-colors"
              aria-label="Copy reply"
            >
              <Copy size={12} /> Copy
            </button>
            <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">•</span>
            <span>{time}</span>
          </div>
        </div>

        {/* Confirmation */}
        {message.pending && (
          <div className="max-w-[90%] md:max-w-[85%] rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-900/10 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle size={14} aria-hidden="true" /> Needs your confirmation
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800 dark:text-gray-200">
              {message.pending.items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
            {message.pendingState === 'open' ? (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => onResolvePending(true)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => onResolvePending(false)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-slate-600 hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : message.pendingState && (
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5" role="status">
                {message.pendingState === 'running' && <Loader2 size={12} className="animate-spin text-primary" />}
                {PENDING_STATE_TEXT[message.pendingState]}
              </p>
            )}
          </div>
        )}

        {/* Action Results */}
        {message.actions && message.actions.length > 0 && (
          <div className="space-y-2 max-w-[90%] md:max-w-[85%]">
            {message.actions.map((action, i) => (
              <ActionResult key={i} action={action} />
            ))}
          </div>
        )}

        {/* Suggestions */}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {message.suggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(suggestion)}
                title={suggestion}
                className="text-xs px-2.5 md:px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:text-primary hover:border-primary transition-colors flex items-center gap-1"
              >
                <ChevronRight size={12} className="flex-shrink-0" />
                <span className="truncate max-w-[240px] md:max-w-[320px]">{suggestion}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
