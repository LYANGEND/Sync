import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Plus, Edit3, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { PageHeader } from '../../components/ui/DesignSystem';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

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
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AcademicEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');

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

  useEffect(() => {
    fetchEvents();
  }, [year, month]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const startDate = new Date(year, month, 1).toISOString();
      const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
      const res = await api.get('/academic-calendar', { params: { startDate, endDate } });
      setEvents(res.data);
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoading(false);
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
    const dateStr = d.toISOString().split('T')[0];
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
      startDate: event.startDate.split('T')[0],
      endDate: event.endDate.split('T')[0],
      isAllDay: event.isAllDay,
      color: event.color || '',
    });
    setEditingEvent(event);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
      };

      if (editingEvent) {
        await api.put(`/academic-calendar/${editingEvent.id}`, payload);
        toast.success('Event updated');
      } else {
        await api.post('/academic-calendar', payload);
        toast.success('Event created');
      }
      setShowModal(false);
      fetchEvents();
    } catch (error) {
      toast.error('Failed to save event');
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
      fetchEvents();
    } catch (error) {
      toast.error('Failed to delete event');
    }
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = new Date();
  const isToday = (day: number) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const days = getDaysInMonth();

  // List view — upcoming events sorted
  const sortedEvents = [...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  return (
    <div className="ds-page">
      {/* Header */}
      <PageHeader title="Academic Calendar" description="School events, holidays, and important dates." actions={
        <div className="ds-actions">
          <div className="ds-actions" role="group" aria-label="Calendar view">
            <button onClick={() => setViewMode('month')} aria-pressed={viewMode === 'month'} className={viewMode === 'month' ? 'ds-button-primary' : 'ds-button-secondary'}>
              Month
            </button>
            <button onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} className={viewMode === 'list' ? 'ds-button-primary' : 'ds-button-secondary'}>
              List
            </button>
          </div>
          {isAdmin && (
            <button onClick={() => openCreateModal()} className="ds-button-primary">
              <Plus className="w-4 h-4" aria-hidden="true" /> Add Event
            </button>
          )}
        </div>
      } />

      {loading && <p role="status" className="ds-helper">Loading calendar events...</p>}

      {viewMode === 'month' ? (
        <>
          {/* Month Navigation */}
          <div className="ds-card flex items-center justify-between gap-3">
            <button onClick={prevMonth} className="ds-button-ghost" aria-label="Previous month">
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <h2 aria-live="polite">{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} className="ds-button-ghost" aria-label="Next month">
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Calendar Grid */}
          {/* Specialized calendar exception: seven columns and compact event chips, not ds-table padding or full-height buttons. */}
          <div className="ds-surface overflow-x-auto" role="region" aria-label={`${MONTHS[month]} ${year} calendar`} tabIndex={0}>
            <div className="min-w-[560px]">
            {/* Day Headers */}
            <div className="grid grid-cols-7 bg-[var(--surface-muted)]">
              {DAYS.map(d => (
                <div key={d} className="p-2 text-center text-xs font-semibold text-[var(--text-secondary)] border-b border-[var(--border-color)]">
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
                    className={`min-h-[80px] md:min-h-[100px] border-b border-r border-[var(--border-color)] p-1 ${
                      day ? 'hover:bg-[var(--surface-muted)]' : 'bg-[var(--surface-muted)]'
                    }`}
                    onClick={() => day && isAdmin && openCreateModal(new Date(year, month, day))}
                  >
                    {day && (
                      <>
                        {isAdmin ? (
                          <button type="button" className={`ds-button-ghost mb-0.5 ${isToday(day) ? 'ring-2 ring-inset ring-[var(--action-color)]' : ''}`}
                            aria-label={`Add event on ${new Date(year, month, day).toLocaleDateString()}`}
                            aria-current={isToday(day) ? 'date' : undefined}
                            onClick={ev => { ev.stopPropagation(); openCreateModal(new Date(year, month, day)); }}>
                            {day}
                          </button>
                        ) : (
                          <div aria-current={isToday(day) ? 'date' : undefined} className={`text-xs font-semibold mb-0.5 w-6 h-6 flex items-center justify-center rounded-full ${isToday(day) ? 'bg-[var(--action-color)] text-[var(--action-foreground)]' : 'text-[var(--text-primary)]'}`}>{day}</div>
                        )}
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map(e => (
                            <button type="button"
                              key={e.id}
                              className="ds-button-secondary w-full !min-h-0 !min-w-0 !justify-start !rounded !px-1 !py-0.5 !text-xs border-l-4"
                              style={{ borderLeftColor: e.color || getEventColor(e.eventType) }}
                              onClick={(ev) => { ev.stopPropagation(); setSelectedDate(new Date(year, month, day)); }}
                              title={e.title}
                              aria-label={`${e.title}, ${new Date(year, month, day).toLocaleDateString()}`}
                            >
                              <span className="truncate">{e.title}</span>
                            </button>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-xs text-[var(--text-secondary)]">+{dayEvents.length - 3} more</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </div>

          {/* Event Legend */}
          <div className="mt-4 flex flex-wrap gap-3">
            {EVENT_TYPES.map(t => (
              <div key={t.value} className="ds-badge ds-badge-neutral">
                <div aria-hidden="true" className="w-3 h-3 rounded-sm" style={{ backgroundColor: t.color }}></div>
                <span>{t.label}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* List View */
        <div className="space-y-3">
          {sortedEvents.length === 0 ? (
            <div className="ds-card ds-empty">
              <CalendarIcon className="w-12 h-12 mx-auto mb-3" aria-hidden="true" />
              <p>No events this month</p>
            </div>
          ) : (
            sortedEvents.map(event => (
              <div key={event.id} className="ds-card flex flex-wrap items-start gap-4">
                <div aria-hidden="true" className="w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: `${getEventColor(event.eventType)}20` }}>
                  {getEventIcon(event.eventType)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="break-words">{event.title}</h3>
                  {event.description && <p className="ds-helper mt-1 break-words">{event.description}</p>}
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="ds-badge ds-badge-neutral" style={{ borderLeftColor: getEventColor(event.eventType), borderLeftWidth: 4 }}>
                      {EVENT_TYPES.find(t => t.value === event.eventType)?.label}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {new Date(event.startDate).toLocaleDateString()} 
                      {event.startDate !== event.endDate && ` — ${new Date(event.endDate).toLocaleDateString()}`}
                    </span>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button onClick={() => openEditModal(event)} className="ds-button-ghost" aria-label={`Edit ${event.title}`}>
                      <Edit3 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button onClick={() => handleDelete(event.id)} className="ds-button-destructive" aria-label={`Delete ${event.title}`}>
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-labelledby="calendar-event-title" className="ds-card w-full max-w-md max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 id="calendar-event-title">
                {editingEvent ? 'Edit Event' : 'New Event'}
              </h3>
              <button onClick={() => setShowModal(false)} className="ds-button-ghost" aria-label="Close event editor">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="calendar-title" className="ds-label mb-1">Title (required)</label>
                <input id="calendar-title" type="text" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="ds-input"
                />
              </div>
              <div>
                <label htmlFor="calendar-type" className="ds-label mb-1">Type</label>
                <select id="calendar-type" value={form.eventType} onChange={e => setForm({ ...form, eventType: e.target.value })}
                  className="ds-select"
                >
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="calendar-start" className="ds-label mb-1">Start Date (required)</label>
                  <input id="calendar-start" type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                    className="ds-input"
                  />
                </div>
                <div>
                  <label htmlFor="calendar-end" className="ds-label mb-1">End Date (required)</label>
                  <input id="calendar-end" type="date" required value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
                    className="ds-input"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="calendar-description" className="ds-label mb-1">Description</label>
                <textarea id="calendar-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                  className="ds-textarea"
                />
              </div>
              <div className="ds-form-actions">
                <button type="button" onClick={() => setShowModal(false)} className="ds-button-outline">
                  Cancel
                </button>
                <button type="submit" className="ds-button-primary">
                  {editingEvent ? 'Update' : 'Create'}
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
