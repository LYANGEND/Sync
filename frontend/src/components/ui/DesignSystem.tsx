import React, { forwardRef, useId, useRef } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Info, Inbox, Loader2, type LucideIcon } from 'lucide-react';

const cx = (...values: (string | undefined | false)[]) => values.filter(Boolean).join(' ');
type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export function PageHeader({ title, description, actions, breadcrumb }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; breadcrumb?: React.ReactNode;
}) {
  return <header className="ds-page-header">
    <div className="min-w-0">
      {breadcrumb && <nav aria-label="Breadcrumb" className="ds-helper mb-2">{breadcrumb}</nav>}
      <h1 className="ds-page-title">{title}</h1>
      {description && <p className="ds-page-subtitle">{description}</p>}
    </div>
    {actions && <div className="ds-actions">{actions}</div>}
  </header>;
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  loading?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading, disabled, type = 'button', className, children, ...props }, ref
) {
  return <button {...props} ref={ref} type={type} disabled={disabled || loading}
    aria-busy={loading || undefined} className={cx(`ds-button-${variant}`, className)}>
    {loading && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}{children}
  </button>;
});

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input {...props} ref={ref} className={cx('ds-input', className)} />;
});
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select {...props} ref={ref} className={cx('ds-select', className)} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea {...props} ref={ref} className={cx('ds-textarea', className)} />;
});

/** Match the child's id to htmlFor; associate hint/error ids through aria-describedby. */
export function FormField({ label, htmlFor, hint, error, required, children }: {
  label: React.ReactNode; htmlFor: string; hint?: React.ReactNode; error?: React.ReactNode;
  required?: boolean; children: React.ReactNode;
}) {
  return <div className="ds-field">
    <label htmlFor={htmlFor} className="ds-label">{label}{required && <span> (required)</span>}</label>
    {children}
    {hint && <p id={`${htmlFor}-hint`} className="ds-helper">{hint}</p>}
    {error && <p id={`${htmlFor}-error`} className="ds-field-error" role="alert">{error}</p>}
  </div>;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx('ds-card', className)} />;
}

export function StatCard({ label, value, icon: Icon, detail, tone = 'info' }: {
  label: string; value: React.ReactNode; icon: LucideIcon; detail?: string; tone?: Tone;
}) {
  return <Card className="ds-stat">
    <div className="flex items-center justify-between gap-3">
      <p className="ds-helper font-medium">{label}</p>
      <span className={cx('ds-stat-icon', `ds-badge-${tone}`)}><Icon size={20} aria-hidden="true" /></span>
    </div>
    <p className="ds-stat-value">{value}</p>
    {detail && <p className="ds-helper text-xs">{detail}</p>}
  </Card>;
}

export function Badge({ tone = 'neutral', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span {...props} className={cx('ds-badge', `ds-badge-${tone}`, className)} />;
}

export function Alert({ tone = 'info', children, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' || tone === 'warning' ? AlertCircle : Info;
  return <div role={tone === 'error' ? 'alert' : 'status'} {...props} className={cx('ds-alert', `ds-badge-${tone}`, className)}>
    <Icon size={20} className="shrink-0" aria-hidden="true" /><div className="min-w-0">{children}</div>
  </div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="ds-empty">
    <Inbox size={28} aria-hidden="true" className="mx-auto mb-3" />
    <h3>{title}</h3>{description && <p className="mt-2">{description}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>;
}

export function TableContainer({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div role="region" aria-label={label} tabIndex={0} className={cx('ds-table-container', className)}>{children}</div>;
}

export function Pagination({ page, pageCount, onPageChange }: { page: number; pageCount: number; onPageChange: (page: number) => void }) {
  const count = Math.max(1, pageCount);
  return <nav aria-label="Pagination" className="ds-pagination">
    <p className="ds-helper" aria-live="polite">Page {page} of {count}</p>
    <div className="ds-actions">
      <Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={16} aria-hidden="true" />Previous</Button>
      <Button variant="outline" disabled={page >= count} onClick={() => onPageChange(page + 1)}>Next<ChevronRight size={16} aria-hidden="true" /></Button>
    </div>
  </nav>;
}

export function Avatar({ name, src }: { name: string; src?: string }) {
  return src ? <img src={src} alt={name} className="ds-avatar" /> :
    <span className="ds-avatar" role="img" aria-label={name}>{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'}</span>;
}

export interface TabItem { id: string; label: React.ReactNode; disabled?: boolean }
export function Tabs({ items, value, onChange, label, id }: {
  items: TabItem[]; value: string; onChange: (id: string) => void; label: string; id: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return <div role="tablist" aria-label={label} className="ds-tabs">
    {items.map((item, index) => <button key={item.id} ref={el => { refs.current[index] = el; }}
      type="button" role="tab" id={`${id}-tab-${item.id}`} aria-controls={`${id}-panel-${item.id}`}
      aria-selected={value === item.id} disabled={item.disabled} tabIndex={value === item.id ? 0 : -1}
      className={cx('ds-tab', value === item.id && 'ds-tab-active')}
      onClick={() => onChange(item.id)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const enabled = items.map((tab, i) => !tab.disabled ? i : -1).filter(i => i >= 0);
        if (!enabled.length) return;
        const position = enabled.indexOf(index);
        const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled[enabled.length - 1] :
          enabled[(position + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length];
        onChange(items[next].id);
        refs.current[next]?.focus();
      }}>{item.label}</button>)}
  </div>;
}

export function TabPanel({ id, value, children }: { id: string; value: string; children: React.ReactNode }) {
  return <section role="tabpanel" id={`${id}-panel-${value}`} aria-labelledby={`${id}-tab-${value}`} tabIndex={0} className="min-w-0">{children}</section>;
}

export function Tooltip({ text, children }: { text: string; children: React.ReactElement }) {
  const id = useId();
  return <span className="ds-tooltip-trigger">
    {React.cloneElement(children, { 'aria-describedby': [children.props['aria-describedby'], id].filter(Boolean).join(' ') })}
    <span id={id} role="tooltip" className="ds-tooltip">{text}</span>
  </span>;
}
