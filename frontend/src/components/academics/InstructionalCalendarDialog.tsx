import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, CheckCircle2, Loader2, Save, Sparkles, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

interface TermOption {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status?: 'DRAFT' | 'ACTIVE' | 'CLOSING' | 'CLOSED';
}

interface InstructionalDay {
  id?: string;
  date: string;
  isInstructional: boolean;
  label?: string | null;
}

interface InstructionalCalendarDialogProps {
  term: TermOption | null;
  onClose: () => void;
}

const isoDay = (value: string | Date) => {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

const buildTermDays = (term: TermOption, existing: InstructionalDay[]) => {
  const existingMap = new Map(existing.map(day => [isoDay(day.date), day]));
  const start = new Date(`${isoDay(term.startDate)}T00:00:00.000Z`);
  const end = new Date(`${isoDay(term.endDate)}T00:00:00.000Z`);
  const days: InstructionalDay[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = isoDay(cursor);
    const stored = existingMap.get(date);
    const weekday = cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6;
    days.push(stored
      ? { ...stored, date }
      : { date, isInstructional: false, label: weekday ? null : 'Weekend' });
  }
  return days;
};

const InstructionalCalendarDialog: React.FC<InstructionalCalendarDialogProps> = ({ term, onClose }) => {
  const [days, setDays] = useState<InstructionalDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const dialogRef = useDialogAccessibility(Boolean(term), () => { if (!saving) onClose(); });
  const editable = term?.status === 'DRAFT' || term?.status === 'ACTIVE';

  useEffect(() => {
    if (!term) return;
    let active = true;
    setLoading(true);
    api.get<InstructionalDay[]>(`/academic-terms/${term.id}/instructional-days`)
      .then(response => {
        if (active) setDays(buildTermDays(term, response.data));
      })
      .catch((error: any) => toast.error(error.response?.data?.error || 'Instructional calendar could not be loaded'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [term?.id]);

  const summary = useMemo(() => ({
    total: days.length,
    instructional: days.filter(day => day.isInstructional).length,
    nonInstructional: days.filter(day => !day.isInstructional).length,
  }), [days]);

  if (!term) return null;

  const toggleDay = (date: string) => {
    setDays(current => current.map(day => day.date === date
      ? {
        ...day,
        isInstructional: !day.isInstructional,
        label: day.isInstructional ? (day.label || 'Non-instructional') : null,
      }
      : day));
  };

  const applyWeekdayTemplate = () => {
    setDays(current => current.map(day => {
      const date = new Date(`${day.date}T00:00:00.000Z`);
      const weekday = date.getUTCDay() !== 0 && date.getUTCDay() !== 6;
      return { ...day, isInstructional: weekday, label: weekday ? null : 'Weekend' };
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await api.put<InstructionalDay[]>(`/academic-terms/${term.id}/instructional-days`, {
        days: days.map(day => ({
          date: day.date,
          isInstructional: day.isInstructional,
          label: day.label?.trim() || null,
        })),
      });
      setDays(buildTermDays(term, response.data));
      toast.success('Instructional calendar saved');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Instructional calendar could not be saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="instructional-calendar-title" className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <header className="border-b border-slate-200 bg-slate-950 px-5 py-5 text-white dark:border-slate-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300"><CalendarCheck2 size={16} /> Explicit attendance denominator</div>
              <h2 id="instructional-calendar-title" className="text-xl font-bold">{term.name} instructional calendar</h2>
              <p className="mt-1 text-sm text-slate-300">Only instructional dates count toward attendance readiness and report totals.</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="grid size-11 place-items-center rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" aria-label="Close instructional calendar"><X size={20} /></button>
          </div>
        </header>

        <div className="grid grid-cols-3 border-b border-slate-200 dark:border-slate-700">
          <Summary label="Term days" value={summary.total} />
          <Summary label="Instructional" value={summary.instructional} emphasis />
          <Summary label="Non-instructional" value={summary.nonInstructional} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <p className="text-sm text-slate-500">Status: <strong className="text-slate-800 dark:text-slate-100">{term.status || 'UNKNOWN'}</strong>{!editable && ' · calendar locked'}</p>
          {editable && <button type="button" onClick={applyWeekdayTemplate} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-600 dark:text-slate-200"><Sparkles size={16} /> Apply weekday template</button>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex min-h-72 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 animate-spin" size={18} /> Loading calendar…</div>
          ) : (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Instructional status and labels for each date in {term.name}</caption>
              <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Day</th><th className="px-5 py-3">Instructional</th><th className="px-5 py-3">Label</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {days.map(day => {
                  const date = new Date(`${day.date}T00:00:00.000Z`);
                  return (
                    <tr key={day.date} className={day.isInstructional ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 text-slate-500 dark:bg-slate-900/40'}>
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">{day.date}</td>
                      <td className="px-5 py-3">{date.toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' })}</td>
                      <td className="px-5 py-3">
                        <button type="button" disabled={!editable} onClick={() => toggleDay(day.date)} aria-pressed={day.isInstructional} className={`inline-flex min-h-10 min-w-28 items-center justify-center gap-2 rounded-full px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed ${day.isInstructional ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                          {day.isInstructional && <CheckCircle2 size={15} />} {day.isInstructional ? 'Instructional' : 'Excluded'}
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <input value={day.label || ''} disabled={!editable} onChange={event => setDays(current => current.map(item => item.date === day.date ? { ...item, label: event.target.value } : item))} placeholder={day.isInstructional ? 'Optional note' : 'Holiday / weekend / closure'} className="h-10 w-full min-w-48 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/50" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="max-w-2xl text-xs leading-5 text-slate-500">Dates with attendance cannot be disabled or removed. The calendar locks when the term starts closing or a report is finalized.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-surface-hover dark:border-slate-600 dark:text-slate-200">Close</button>
            {editable && <button type="button" onClick={() => void save()} disabled={saving || loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Save calendar</button>}
          </div>
        </footer>
      </div>
    </div>
  );
};

const Summary = ({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) => (
  <div className={`px-5 py-4 ${emphasis ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-white dark:bg-slate-900'}`}>
    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-2xl font-bold tabular-nums ${emphasis ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}`}>{value}</p>
  </div>
);

export default InstructionalCalendarDialog;
