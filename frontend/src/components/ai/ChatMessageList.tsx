import { useEffect, useRef, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  sending: boolean;
  /** Accent colour for user bubbles & avatar ring */
  accentColor?: 'purple' | 'emerald' | 'blue';
  /** Loading indicator text */
  thinkingText?: string;
  /** Avatar shown before assistant messages (optional) */
  assistantAvatar?: ReactNode;
  /** Render the assistant message body (default: plain text) */
  renderAssistantContent?: (content: string) => ReactNode;
  /** Extra action buttons rendered below each assistant message */
  messageActions?: (msg: ChatMessage) => ReactNode;
  /** Shown when messages array is empty and not sending */
  emptyState?: ReactNode;
}

const accent = {
  purple: { user: 'bg-purple-600', timestamp: 'text-purple-200' },
  emerald: { user: 'bg-emerald-600', timestamp: 'text-emerald-200' },
  blue: { user: 'bg-blue-600', timestamp: 'text-blue-200' },
} as const;

export default function ChatMessageList({
  messages,
  sending,
  accentColor = 'purple',
  thinkingText = 'Thinking...',
  assistantAvatar,
  renderAssistantContent,
  messageActions,
  emptyState,
}: ChatMessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const colors = accent[accentColor];

  if (messages.length === 0 && !sending && emptyState) {
    return <div className="flex-1 overflow-y-auto">{emptyState}</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {msg.role === 'assistant' && assistantAvatar}

          <div
            className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? `${colors.user} text-white rounded-br-md`
                : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-bl-md'
            }`}
          >
            {msg.role === 'assistant' && renderAssistantContent
              ? renderAssistantContent(msg.content)
              : <p className="whitespace-pre-wrap text-sm">{msg.content}</p>}

            <p
              className={`text-[10px] mt-1 ${
                msg.role === 'user' ? colors.timestamp : 'text-gray-400 dark:text-slate-500'
              }`}
            >
              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          {msg.role === 'assistant' && messageActions?.(msg)}
        </div>
      ))}

      {sending && (
        <div className="flex gap-3 justify-start">
          {assistantAvatar}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl rounded-bl-md px-4 py-3">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              <span className="text-sm text-gray-500 dark:text-slate-400">{thinkingText}</span>
            </div>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
