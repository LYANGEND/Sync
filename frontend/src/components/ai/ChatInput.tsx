import { useRef, useEffect, KeyboardEvent, ChangeEvent, ReactNode } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  disabled?: boolean;
  placeholder?: string;
  accentColor?: 'purple' | 'emerald' | 'blue';
  /** Icon or element rendered before the textarea */
  prefix?: ReactNode;
  /** Content rendered below the input bar (disclaimer, clear button, etc.) */
  footer?: ReactNode;
}

const sendBg = {
  purple: 'bg-purple-600 hover:bg-purple-700',
  emerald: 'bg-emerald-600 hover:bg-emerald-700',
  blue: 'bg-blue-600 hover:bg-blue-700',
} as const;

export default function ChatInput({
  value,
  onChange,
  onSend,
  sending,
  disabled,
  placeholder = 'Type a message...',
  accentColor = 'purple',
  prefix,
  footer,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const canSend = value.trim().length > 0 && !sending && !disabled;

  return (
    <div className="px-4 pb-4">
      <div className="flex items-end gap-2 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-2 shadow-sm focus-within:ring-2 focus-within:ring-opacity-50 focus-within:ring-blue-300">
        {prefix}
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled || sending}
          style={{ minHeight: '40px', maxHeight: '128px' }}
          className="flex-1 resize-none bg-transparent border-0 focus:ring-0 focus:outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 px-2 py-1.5"
        />
        <button
          onClick={onSend}
          disabled={!canSend}
          className={`p-2.5 rounded-xl text-white transition-colors ${
            canSend ? sendBg[accentColor] : 'bg-gray-300 dark:bg-slate-600 cursor-not-allowed'
          }`}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      {footer}
    </div>
  );
}
