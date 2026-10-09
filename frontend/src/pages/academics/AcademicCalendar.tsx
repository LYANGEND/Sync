import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, Plus, Edit3, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { dateInputToIso, formatDateInputValue } from '../../utils/dateInput';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

interface AcademicEvent {
  id: string;
  title: string;
  description?: string;
  eventType: string;
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  color?: string;
}

const EVENT_TYPES = [
  { value: 'HOLIDAY', label: 'Holiday', color: '#ef4444', icon: '🏖️' },
  { value: 'EXAM_PERIOD', label: 'Exam Period', color: '#f59e0b', icon: '📝' },
  { value: 'PARENT_MEETING', label: 'Parent Meeting', color: '#8b5cf6', icon: '👨‍👩‍👧' },
  { value: 'SPORTS_DAY', label: 'Sports Day', color: '#10b981', icon: '⚽' },
  { value: 'CULTURAL_EVENT', label: 'Cultural Event', color: '#ec4899', icon: '🎭' },
  { value: 'DEADLINE', label: 'Deadline', color: '#f97316', icon: '⏰' },
  { value: 'STAFF_DEVELOPMENT', label: 'Staff Development', color: '#06b6d4', icon: '📚' },
  { value: 'SCHOOL_CLOSURE', label: 'School Closure', color: '#64748b', icon: '🏫' },
  { value: 'OTHER', label: 'Other', color: '#6366f1', icon: '📌' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const AcademicCalendar: React.FC = () => {
  const { confirm } = useAppDialog();
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const [events, setEvents] = useState<AcademicEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AcademicEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');
  const eventsRequestRef = useRef(0);

  const [form, setForm] = useState({
    title: '',
    description: '',
    eventType: 'OTHER',
    startDate: '',
    endDate: '',
    isAllDay: true,
    color: '',
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const closeEventDialog = () => {
    if (!saving) setShowModal(false);
  };
  const eventDialogRef = useDialogAccessibility(showModal, closeEventDialog);

  useEffect(() => {
    fetchEvents();
  }, [year, month]);

  const fetchEvents = async () => {
    const requestId = ++eventsRequestRef.current;
    try {
      setLoading(true);
      setError(null);
      const startDate = new Date(year, month, 1).toISOString();
      const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      const res = await api.get('/academic-calendar', { params: { startDate, endDate } });
      if (requestId !== eventsRequestRef.current) return;
      setEvents(res.data);
    } catch (error) {
      if (requestId !== eventsRequestRef.current) return;
      console.error('Failed to fetch events:', error);
      setError('Calendar events could not be loaded.');
    } finally {
      if (requestId === eventsRequestRef.current) setLoading(false);
    }
  };

  const getDaysInMonth = () => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  const getEventsForDay = (day: number) => {
    const dayDate = new Date(year, month, day);
    return events.filter(e => {
      const start = new Date(e.startDate);
      const end = new Date(e.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return dayDate >= start && dayDate <= end;
    });
  };

  const getEventColor = (eventType: string) => {
    return EVENT_TYPES.find(t => t.value === eventType)?.color || '#6366f1';
  };

  const getEventIcon = (eventType: string) => {
    return EVENT_TYPES.find(t => t.value === eventType)?.icon || '📌';
  };

  const openCreateModal = (date?: Date) => {
    const d = date || new Date();
    const dateStr = formatDateInputValue(d);
    setForm({
      title: '',
      description: '',
      eventType: 'OTHER',
      startDate: dateStr,
      endDate: dateStr,
      isAllDay: true,
      color: '',
    });
    setEditingEvent(null);
    setShowModal(true);
  };

  const openEditModal = (event: AcademicEvent) => {
    setForm({
      title: event.title,
      description: event.description || '',
      eventType: event.eventType,
      startDate: formatDateInputValue(event.startDate),
      endDate: formatDateInputValue(event.endDate),
      isAllDay: event.isAllDay,
      color: event.color || '',
    });
    setEditingEvent(event);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.startDate > form.endDate) {
      toast.error('End date must be on or after start date');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        ...form,
        startDate: dateInputToIso(form.startDate),
        endDate: dateInputToIso(form.endDate),
      };

      if (editingEvent) {
        await api.put(`/academic-calendar/${editingEvent.id}`, payload);
        toast.success('Event updated');
      } else {
        await api.post('/academic-calendar', payload);
        toast.success('Event created');
      }
      setShowModal(false);
      await fetchEvents();
    } catch (error: any) {
      const apiError = error.response?.data?.error;
      toast.error(typeof apiError === 'string' ? apiError : 'Failed to save event');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({
      title: 'Delete event?',
      message: 'Delete this event?',
      confirmText: 'Delete event',
    }))) return;
    try {
      await api.delete(`/academic-calendar/${id}`);
      toast.success('Event deleted');
      await fetchEvents();
    } catch (error) {
      toast.error('Failed to delete event');
    }
  };

  const prevMonth = () => {
    setSelectedDate(null);
    setCurrentDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setSelectedDate(null);
    setCurrentDate(new Date(year, month + 1, 1));
  };
  const today = new Date();
  const isToday = (day: number) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const days = getDaysInMonth();

  // List view — upcoming events sorted
  const sortedEvents = [...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Academic Calendar</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-0.5">
            <button onClick={() => setViewMode('month')} className={`px-3 py-1 text-sm rounded-md ${viewMode === 'month' ? 'bg-white dark:bg-slate-600 shadow-sm font-medium' : ''}`}>
              Month
            </button>
            <button onClick={() => setViewMode('list')} className={`px-3 py-1 text-sm rounded-md ${viewMode === 'list' ? 'bg-white dark:bg-slate-600 shadow-sm font-medium' : ''}`}>
              List
            </button>
          </div>
          {isAdmin && (
            <button onClick={() => openCreateModal()} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm">
              <Plus className="w-4 h-4" /> Add Event
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={fetchEvents} className="min-h-10 rounded-lg bg-red-100 px-3 font-semibold hover:bg-red-200 dark:bg-red-900/50 dark:hover:bg-red-900">Retry</button>
        </div>
      )}

      {loading && <div className="mb-4 text-sm font-medium text-blue-600 dark:text-blue-300" role="status">Loading calendar events…</div>}

      {viewMode === 'month' ? (
        <>
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="grid size-11 place-items-center rounded-lg hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-label="Previous month">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{MONTHS[month]} {year}</h3>
            <button onClick={nextMonth} className="grid size-11 place-items-center rounded-lg hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-label="Next month">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            {/* Day Headers */}
            <div className="grid grid-cols-7 bg-gray-50 dark:bg-slate-900">
              {DAYS.map(d => (
                <div key={d} className="p-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700">
                  {d}
                </div>
              ))}
            </div>

            {/* Day Cells */}
            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                const dayEvents = day ? getEventsForDay(day) : [];
                return (
                  <div
                    key={i}
                    className={`min-h-[80px] md:min-h-[100px] border-b border-r border-gray-100 dark:border-slate-700/50 p-1 ${
                      day ? 'cursor-pointer hover:bg-surface-hover' : 'bg-gray-50/50 dark:bg-slate-900/30'
                    }`}
                    onClick={() => day && isAdmin && openCreateModal(new Date(year, month, day))}
                    role={day && isAdmin ? 'button' : undefined}
                    tabIndex={day && isAdmin ? 0 : undefined}
                    aria-label={day && isAdmin ? `Add event on ${MONTHS[month]} ${day}, ${year}` : undefined}
                    onKeyDown={(event) => {
                      if (day && isAdmin && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        openCreateModal(new Date(year, month, day));
                      }
                    }}
                  >
                    {day && (
                      <>
                        <div className={`text-xs font-medium mb-0.5 w-6 h-6 flex items-center justify-center rounded-full ${
                          isToday(day) ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {day}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map(e => (
                            <button
                              type="button"
                              key={e.id}
                              className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:text-xs"
                              style={{ backgroundColor: e.color || getEventColor(e.eventType) }}
                              onClick={(ev) => { ev.stopPropagation(); setSelectedDate(new Date(year, month, day)); }}
                              title={e.title}
                            >
                              {e.title}
                            </button>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-[10px] text-gray-500">+{dayEvents.length - 3} more</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {selectedDate && (
            <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800" aria-labelledby="selected-calendar-day-title">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 id="selected-calendar-day-title" className="font-semibold text-gray-900 dark:text-white">
                  Events on {selectedDate.toLocaleDateString(undefined, { dateStyle: 'long' })}
                </h3>
                <button type="button" onClick={() => setSelectedDate(null)} className="grid size-10 place-items-center rounded-lg text-gray-500 hover:bg-surface-hover" aria-label="Close selected day details">
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="space-y-2">
                {getEventsForDay(selectedDate.getDate()).map((event) => (
                  <div key={event.id} className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 dark:bg-slate-900/60">
                    <span className="text-xl" aria-hidden="true">{getEventIcon(event.eventType)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 dark:text-white">{event.title}</p>
                      {event.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{event.description}</p>}
                    </div>
                    {isAdmin && (
                      <button type="button" onClick={() => openEditModal(event)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-blue-600 hover:bg-surface-hover-accent">Edit</button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Event Legend */}
          <div className="mt-4 flex flex-wrap gap-3">
            {EVENT_TYPES.map(t => (
              <div key={t.value} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: t.color }}></div>
                <span>{t.icon} {t.label}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* List View */
        <div className="space-y-3">
          {sortedEvents.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No events this month</p>
            </div>
          ) : (
            sortedEvents.map(event => (
              <div key={event.id} className="flex items-start gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: `${getEventColor(event.eventType)}20` }}>
                  {getEventIcon(event.eventType)}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-800 dark:text-white">{event.title}</h4>
                  {event.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{event.description}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: getEventColor(event.eventType) }}>
                      {EVENT_TYPES.find(t => t.value === event.eventType)?.label}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(event.startDate).toLocaleDateString()} 
                      {event.startDate !== event.endDate && ` — ${new Date(event.endDate).toLocaleDateString()}`}
                    </span>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button onClick={() => openEditModal(event)} className="grid size-11 place-items-center rounded-lg hover:bg-surface-hover" aria-label={`Edit ${event.title}`}>
                      <Edit3 className="w-4 h-4 text-gray-500" />
                    </button>
                    <button onClick={() => handleDelete(event.id)} className="grid size-11 place-items-center rounded-lg hover:bg-surface-hover-danger" aria-label={`Delete ${event.title}`}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEventDialog(); }}>
          <div ref={eventDialogRef} className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="academic-event-dialog-title">
            <div className="flex items-center justify-between mb-4">
              <h3 id="academic-event-dialog-title" className="text-lg font-bold text-gray-800 dark:text-white">
                {editingEvent ? 'Edit Event' : 'New Event'}
              </h3>
              <button onClick={closeEventDialog} className="grid size-11 place-items-center rounded-lg hover:bg-surface-hover" aria-label="Close event dialog">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="academic-event-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input id="academic-event-title" data-dialog-autofocus="true" type="text" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="academic-event-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                <select id="academic-event-type" value={form.eventType} onChange={e => setForm({ ...form, eventType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                >
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="academic-event-start" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                  <input id="academic-event-start" type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="academic-event-end" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                  <input id="academic-event-end" type="date" required min={form.startDate || undefined} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="academic-event-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea id="academic-event-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeEventDialog} disabled={saving} className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? 'Saving…' : editingEvent ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AcademicCalendar;
