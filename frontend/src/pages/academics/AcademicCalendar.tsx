import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Plus, Edit3, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
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
            <button onClick={() => openCreateModal()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              <Plus className="w-4 h-4" /> Add Event
            </button>
          )}
        </div>
      </div>

      {viewMode === 'month' ? (
        <>
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{MONTHS[month]} {year}</h3>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
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
                      day ? 'cursor-pointer hover:bg-blue-50/50 dark:hover:bg-slate-800/50' : 'bg-gray-50/50 dark:bg-slate-900/30'
                    }`}
                    onClick={() => day && isAdmin && openCreateModal(new Date(year, month, day))}
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
                            <div
                              key={e.id}
                              className="text-[10px] md:text-xs px-1 py-0.5 rounded truncate text-white font-medium"
                              style={{ backgroundColor: e.color || getEventColor(e.eventType) }}
                              onClick={(ev) => { ev.stopPropagation(); setSelectedDate(new Date(year, month, day)); }}
                              title={e.title}
                            >
                              {e.title}
                            </div>
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
                    <button onClick={() => openEditModal(event)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
                      <Edit3 className="w-4 h-4 text-gray-500" />
                    </button>
                    <button onClick={() => handleDelete(event.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                {editingEvent ? 'Edit Event' : 'New Event'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input type="text" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                <select value={form.eventType} onChange={e => setForm({ ...form, eventType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                >
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                  <input type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                  <input type="date" required value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700">
                  Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
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
