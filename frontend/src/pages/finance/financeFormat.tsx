// Shared formatting for the Finance tabs so amounts, dates and progress look the same everywhere.

export const fmt = (amount: number) => `ZMW ${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtWhole = (amount: number) => `ZMW ${Math.round(Number(amount || 0)).toLocaleString('en-US')}`;
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
export const formatPaymentDate = (value: string | Date) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const formatMethod = (method: string) => method.replace('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());

export const ProgressBar = ({ value, label, tone, className = 'mt-3' }: { value: number; label: string; tone: string; className?: string }) => (
  <div
    className={`${className} h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700`}
    role="progressbar"
    aria-label={label}
    aria-valuenow={value}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
  </div>
);
