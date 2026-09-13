import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import Modal from './Modal';
import { Button, FormField, Input } from './DesignSystem';

type NotificationTone = 'info' | 'success' | 'warning' | 'error';
type DialogType = 'confirm' | 'prompt';

interface NoticeItem {
  id: number;
  message: string;
  tone: NotificationTone;
  duration: number;
}

interface DialogState {
  id: number;
  type: DialogType;
  title?: string;
  message: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  placeholder?: string;
  destructive?: boolean;
  resolve: (value: any) => void;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface PromptOptions extends ConfirmOptions {
  defaultValue?: string;
  placeholder?: string;
}

interface AppDialogContextValue {
  notify: (message: string, tone?: NotificationTone, duration?: number) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const AppDialogContext = createContext<AppDialogContextValue | undefined>(undefined);

const toneStyles: Record<NotificationTone, { icon: React.ElementType; badge: string }> = {
  info: {
    icon: Info,
    badge: 'ds-badge-info',
  },
  success: {
    icon: CheckCircle2,
    badge: 'ds-badge-success',
  },
  warning: {
    icon: AlertTriangle,
    badge: 'ds-badge-warning',
  },
  error: {
    icon: AlertCircle,
    badge: 'ds-badge-error',
  },
};

export const AppDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const idRef = useRef(0);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Modal's child effect opens the native dialog first; then choose Cancel rather than Close/Submit.
    if (!dialog) return;
    cancelButtonRef.current?.focus();
    // Repeat after native dialog/StrictMode mount effects without changing Modal's shared API.
    const frame = window.requestAnimationFrame(() => cancelButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [dialog?.id]);

  const closeNotice = useCallback((id: number) => {
    setNotices(current => current.filter(item => item.id !== id));
  }, []);

  const notify = useCallback((message: string, tone: NotificationTone = 'info', duration = 2600) => {
    const id = ++idRef.current;
    setNotices(current => [...current, { id, message, tone, duration }]);
    window.setTimeout(() => closeNotice(id), duration);
  }, [closeNotice]);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const id = ++idRef.current;
      setDialog({ id, type: 'confirm', resolve, ...options });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      const id = ++idRef.current;
      setPromptValue(options.defaultValue ?? '');
      setDialog({ id, type: 'prompt', resolve, ...options });
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const nativeAlert = window.alert.bind(window);
    window.alert = (message?: any) => {
      notify(typeof message === 'string' ? message : String(message ?? ''), 'info');
    };

    return () => {
      window.alert = nativeAlert;
    };
  }, [notify]);

  const handleCloseDialog = useCallback((result: boolean | string | null) => {
    setDialog(current => {
      current?.resolve(result);
      return null;
    });
    setPromptValue('');
  }, []);

  const contextValue = useMemo(() => ({ notify, confirm, prompt }), [notify, confirm, prompt]);

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}

      <div className="sr-only" role="status" aria-live="polite" aria-relevant="additions" aria-atomic="false">
        {notices.filter(notice => notice.tone !== 'error').map(notice => <p key={notice.id}>{notice.tone}: {notice.message}</p>)}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-relevant="additions" aria-atomic="false">
        {notices.filter(notice => notice.tone === 'error').map(notice => <p key={notice.id}>Error: {notice.message}</p>)}
      </div>
      <div className="pointer-events-none fixed z-[120] flex max-h-[calc(100dvh-2rem)] w-96 max-w-[calc(100vw-2rem)] flex-col gap-3"
        style={{ top: 'calc(1rem + env(safe-area-inset-top))', right: 'max(1rem, env(safe-area-inset-right))' }}>
        <div className="flex w-full flex-col gap-3 overflow-y-auto">
          <AnimatePresence>
            {notices.map((notice) => {
              const style = toneStyles[notice.tone];
              const NoticeIcon = style.icon;
              return (
                <motion.div
                  key={notice.id}
                  initial={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.18 }}
                  className="ds-toast pointer-events-auto w-full shrink-0"
                >
                  <div className="flex items-start gap-3 p-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${style.badge}`}>
                      <NoticeIcon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-sm font-medium leading-6"><span className="sr-only">{notice.tone}: </span>{notice.message}</p>
                    <Button variant="ghost"
                      onClick={() => closeNotice(notice.id)}
                      aria-label="Dismiss notification"
                      className="shrink-0 px-2"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {dialog && (
        <Modal key={dialog.id} open
          onClose={() => handleCloseDialog(dialog.type === 'confirm' ? false : null)}
          title={dialog.title || (dialog.type === 'prompt' ? 'Input required' : 'Please confirm')}
          description={dialog.message}
          footer={<>
            <Button ref={cancelButtonRef} variant="outline"
              onClick={() => handleCloseDialog(dialog.type === 'confirm' ? false : null)}>
              {dialog.cancelText || 'Cancel'}
            </Button>
            <Button variant={dialog.destructive ? 'destructive' : 'primary'}
              onClick={() => handleCloseDialog(dialog.type === 'confirm' ? true : promptValue)}>
              {dialog.confirmText || (dialog.type === 'prompt' ? 'Submit' : 'Continue')}
            </Button>
          </>}>
          {dialog.type === 'prompt' && (
            <FormField label="Response" htmlFor={`app-prompt-${dialog.id}`}>
              <Input id={`app-prompt-${dialog.id}`} value={promptValue}
                onChange={event => setPromptValue(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    handleCloseDialog(promptValue);
                  }
                }}
                placeholder={dialog.placeholder} />
            </FormField>
          )}
        </Modal>
      )}
    </AppDialogContext.Provider>
  );
};

export const useAppDialog = () => {
  const context = useContext(AppDialogContext);
  if (!context) {
    throw new Error('useAppDialog must be used within AppDialogProvider');
  }
  return context;
};
