import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

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
  resolve: (value: any) => void;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
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

const toneStyles: Record<NotificationTone, { icon: React.ElementType; shell: string; iconBg: string; iconColor: string }> = {
  info: {
    icon: Info,
    shell: 'border-blue-200/70 bg-white/95 text-slate-900 dark:border-blue-900/60 dark:bg-slate-900/95 dark:text-white',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconColor: 'text-blue-600 dark:text-blue-300',
  },
  success: {
    icon: CheckCircle2,
    shell: 'border-emerald-200/70 bg-white/95 text-slate-900 dark:border-emerald-900/60 dark:bg-slate-900/95 dark:text-white',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    iconColor: 'text-emerald-600 dark:text-emerald-300',
  },
  warning: {
    icon: AlertTriangle,
    shell: 'border-amber-200/70 bg-white/95 text-slate-900 dark:border-amber-900/60 dark:bg-slate-900/95 dark:text-white',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconColor: 'text-amber-600 dark:text-amber-300',
  },
  error: {
    icon: AlertCircle,
    shell: 'border-rose-200/70 bg-white/95 text-slate-900 dark:border-rose-900/60 dark:bg-slate-900/95 dark:text-white',
    iconBg: 'bg-rose-100 dark:bg-rose-900/40',
    iconColor: 'text-rose-600 dark:text-rose-300',
  },
};

export const AppDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const idRef = useRef(0);

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

  const activeStyle = dialog ? toneStyles.warning : toneStyles.info;
  const ActiveIcon = activeStyle.icon;

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}

      <div className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center px-4">
        <div className="flex w-full max-w-md flex-col items-center gap-3">
          <AnimatePresence>
            {notices.map((notice) => {
              const style = toneStyles[notice.tone];
              const NoticeIcon = style.icon;
              return (
                <motion.div
                  key={notice.id}
                  initial={{ opacity: 0, y: 18, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  className={`pointer-events-auto w-full overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl ${style.shell}`}
                >
                  <div className="flex items-center gap-3 px-4 py-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${style.iconBg}`}>
                      <NoticeIcon className={`h-5 w-5 ${style.iconColor}`} />
                    </div>
                    <p className="flex-1 text-sm font-medium leading-6">{notice.message}</p>
                    <button
                      type="button"
                      onClick={() => closeNotice(notice.id)}
                      className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {dialog && (
          <motion.div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-md rounded-3xl border border-white/10 bg-white p-6 shadow-2xl dark:bg-slate-900"
            >
              <div className="mb-4 flex items-start gap-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${activeStyle.iconBg}`}>
                  <ActiveIcon className={`h-5 w-5 ${activeStyle.iconColor}`} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{dialog.title || (dialog.type === 'prompt' ? 'Input required' : 'Please confirm')}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{dialog.message}</p>
                </div>
              </div>

              {dialog.type === 'prompt' && (
                <input
                  autoFocus
                  value={promptValue}
                  onChange={(event) => setPromptValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleCloseDialog(promptValue);
                    if (event.key === 'Escape') handleCloseDialog(null);
                  }}
                  placeholder={dialog.placeholder}
                  className="mb-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none ring-0 transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => handleCloseDialog(dialog.type === 'confirm' ? false : null)}
                  className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {dialog.cancelText || 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => handleCloseDialog(dialog.type === 'confirm' ? true : promptValue)}
                  className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  {dialog.confirmText || (dialog.type === 'prompt' ? 'Submit' : 'Continue')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
