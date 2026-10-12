import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Send, Mic, MicOff, ImagePlus, Square, X } from 'lucide-react';

/** Message input with image attach, dictation, and send/stop. */
export const Composer = ({
  inputRef,
  value,
  onChange,
  onSend,
  onStop,
  image,
  onImageChange,
  isListening,
  onToggleListening,
  isProcessing,
  footer,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  image: string | null;
  onImageChange: (image: string | null) => void;
  isListening: boolean;
  onToggleListening: () => void;
  isProcessing: boolean;
  footer: string;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Grow the input with its content (capped by max-h-32)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [value, inputRef]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => onImageChange(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <>
      {image && (
        <div className="relative inline-block mb-2 md:mb-3">
          <img src={image} alt="Upload preview" className="h-16 w-16 md:h-20 md:w-20 object-cover rounded-lg border border-gray-200 dark:border-slate-600 shadow-sm" />
          <button
            onClick={() => onImageChange(null)}
            className="absolute -top-1.5 -right-1.5 md:-top-2 md:-right-2 p-1 bg-white rounded-full shadow border text-gray-500 hover:text-red-500"
            aria-label="Remove image"
          >
            <X size={12} />
          </button>
        </div>
      )}
      <div
        className="flex items-end gap-1.5 md:gap-2 bg-white/95 dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-1.5 md:p-2 shadow-sm transition-all"
        style={{
          borderColor: 'color-mix(in srgb, var(--primary-color) 10%, rgb(229 231 235))',
          boxShadow: '0 8px 30px rgba(15, 23, 42, 0.06)',
        }}
      >
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          className="hidden"
          onChange={handleImageUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 md:p-2 mb-1 rounded-xl text-primary hover:bg-surface-hover transition-colors flex-shrink-0"
          title="Add Image"
          aria-label="Add image"
        >
          <ImagePlus size={16} className="md:w-[18px] md:h-[18px]" />
        </button>
        <button
          onClick={onToggleListening}
          className={`p-1.5 md:p-2 mb-1 rounded-xl transition-colors flex-shrink-0 ${isListening ? 'text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-900/20' : 'text-primary hover:bg-surface-hover'}`}
          title={isListening ? "Stop listening" : "Start speaking"}
          aria-label={isListening ? 'Stop dictation' : 'Dictate message'}
          aria-pressed={isListening}
        >
          {isListening ? <MicOff size={16} className="md:w-[18px] md:h-[18px]" /> : <Mic size={16} className="md:w-[18px] md:h-[18px]" />}
        </button>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? 'Listening...' : 'Tell me what to do...'}
          aria-label="Message Master AI"
          className="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none px-1.5 md:px-2 py-2 md:py-2.5 max-h-32 overflow-y-auto"
          rows={1}
          style={{ minHeight: '36px' }}
          disabled={isProcessing}
        />
        {isProcessing ? (
          <button
            onClick={onStop}
            className="p-2 md:p-2.5 mb-0.5 rounded-xl border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-surface-hover transition-colors flex-shrink-0"
            title="Stop"
            aria-label="Stop waiting for reply"
          >
            <Square size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!value.trim() && !image}
            className="p-2 md:p-2.5 mb-0.5 text-white rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            title="Send"
            aria-label="Send message"
          >
            <Send size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 text-center mt-1.5 md:mt-2 px-2">
        <span className="hidden sm:inline">{footer}</span>
        <span className="sm:hidden">Review your request before sending.</span>
      </p>
    </>
  );
};
