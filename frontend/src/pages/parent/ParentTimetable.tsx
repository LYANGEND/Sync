import { useState, useEffect } from 'react';
import { Calendar, Clock, User, BookOpen } from 'lucide-react';
import api from '../../services/api';

interface TimetablePeriod {
  id: string;
  dayOfWeek: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
  startTime: string;
  endTime: string;
  subject: { id: string; name: string };
  teacher: { id: string; fullName: string };
}

interface Child {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
  className?: string;
}

interface Term {
  id: string;
  name: string;
  isActive: boolean;
}

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;
const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

const SUBJECT_COLORS: Record<string, string> = {
  Mathematics: 'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300',
  English: 'bg-green-100 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300',
  Science: 'bg-purple-100 border-purple-300 text-purple-800 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-300',
  History: 'bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300',
  Geography: 'bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-300',
  Art: 'bg-pink-100 border-pink-300 text-pink-800 dark:bg-pink-900/30 dark:border-pink-700 dark:text-pink-300',
  Music: 'bg-indigo-100 border-indigo-300 text-indigo-800 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300',
  'Physical Education': 'bg-red-100 border-red-300 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300',
  default: 'bg-slate-100 border-slate-300 text-slate-800 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200',
};

const getSubjectColor = (subjectName: string) => {
  for (const [key, value] of Object.entries(SUBJECT_COLORS)) {
    if (subjectName.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  return SUBJECT_COLORS.default;
};

const ParentTimetable = () => {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [timetable, setTimetable] = useState<TimetablePeriod[]>([]);
  const [activeTerm, setActiveTerm] = useState<Term | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    fetchChildren();
    fetchActiveTerm();
  }, []);

  useEffect(() => {
    if (selectedChild && activeTerm) {
      fetchTimetable();
    }
  }, [selectedChild, activeTerm]);

  const fetchChildren = async () => {
    try {
      const response = await api.get('/parent/children');
      setChildren(response.data.children || []);
      if (response.data.children?.length > 0) {
        setSelectedChild(response.data.children[0]);
      }
    } catch (error) {
      console.error('Failed to fetch children:', error);
    }
  };

  const fetchActiveTerm = async () => {
    try {
      const response = await api.get('/academic-terms');
      const active = response.data.find((t: Term) => t.isActive);
      if (active) {
        setActiveTerm(active);
      }
    } catch (error) {
      console.error('Failed to fetch terms:', error);
    }
  };

  const fetchTimetable = async () => {
    if (!selectedChild || !activeTerm) return;

    try {
      setLoading(true);
      const response = await api.get(
        `/timetable/class/${selectedChild.classId}?termId=${activeTerm.id}`
      );
      setTimetable(response.data);
    } catch (error) {
      console.error('Failed to fetch timetable:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get unique time slots sorted
  const getTimeSlots = () => {
    const slots = new Set<string>();
    timetable.forEach((p) => {
      slots.add(`${p.startTime}-${p.endTime}`);
    });
    return Array.from(slots).sort((a, b) => {
      const aStart = a.split('-')[0];
      const bStart = b.split('-')[0];
      return aStart.localeCompare(bStart);
    });
  };

  // Get period for specific day and time slot
  const getPeriod = (day: string, timeSlot: string) => {
    const [start, end] = timeSlot.split('-');
    return timetable.find(
      (p) => p.dayOfWeek === day && p.startTime === start && p.endTime === end
    );
  };

  // Get today's schedule
  const getTodaySchedule = () => {
    const today = new Date()
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toUpperCase();
    return timetable
      .filter((p) => p.dayOfWeek === today)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const timeSlots = getTimeSlots();
  const todaySchedule = getTodaySchedule();

  return (
    <div className="p-6">
      {/* Child Selection */}
      {children.length > 1 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Select Child
          </label>
          <div className="flex gap-2">
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() => setSelectedChild(child)}
                className={`px-4 py-2 rounded-lg font-medium ${
                  selectedChild?.id === child.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 border text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {child.firstName} {child.lastName}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedChild && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {selectedChild.firstName}'s Timetable
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                {activeTerm ? activeTerm.name : 'Loading term...'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  viewMode === 'grid'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 border text-slate-700 dark:text-slate-300'
                }`}
              >
                Week View
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 border text-slate-700 dark:text-slate-300'
                }`}
              >
                Today
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              Loading timetable...
            </div>
          ) : timetable.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-12 text-center">
              <Calendar className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                No Timetable Available
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                The class timetable hasn't been set up yet.
              </p>
            </div>
          ) : viewMode === 'list' ? (
            /* Today's Schedule View */
            <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700">
              <div className="p-4 border-b dark:border-slate-700">
                <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Today's Schedule
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>

              {todaySchedule.length === 0 ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                  No classes scheduled for today.
                </div>
              ) : (
                <div className="divide-y dark:divide-slate-700">
                  {todaySchedule.map((period) => (
                    <div key={period.id} className="p-4 flex items-center gap-4">
                      <div className="text-center min-w-[80px]">
                        <p className="text-lg font-bold text-slate-900 dark:text-white">
                          {period.startTime}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {period.endTime}
                        </p>
                      </div>
                      <div className="flex-1">
                        <div
                          className={`p-4 rounded-lg border ${getSubjectColor(
                            period.subject.name
                          )}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <BookOpen className="w-4 h-4" />
                            <h3 className="font-semibold">{period.subject.name}</h3>
                          </div>
                          <div className="flex items-center gap-1 text-sm opacity-75">
                            <User className="w-3 h-3" />
                            {period.teacher.fullName}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Week Grid View */
            <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700">
                      <th className="p-3 text-left text-sm font-semibold text-slate-600 dark:text-slate-300 border-b dark:border-slate-600 w-24">
                        <Clock className="w-4 h-4 inline mr-1" />
                        Time
                      </th>
                      {DAYS.map((day) => (
                        <th
                          key={day}
                          className="p-3 text-center text-sm font-semibold text-slate-600 dark:text-slate-300 border-b border-l dark:border-slate-600"
                        >
                          {DAY_LABELS[day]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {timeSlots.map((slot, index) => {
                      const [start, end] = slot.split('-');
                      return (
                        <tr
                          key={slot}
                          className={index % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-700/30'}
                        >
                          <td className="p-2 text-xs text-slate-600 dark:text-slate-400 border-r dark:border-slate-600 align-top">
                            <div className="font-medium">{start}</div>
                            <div className="text-slate-400 dark:text-slate-500">{end}</div>
                          </td>
                          {DAYS.map((day) => {
                            const period = getPeriod(day, slot);
                            return (
                              <td
                                key={`${day}-${slot}`}
                                className="p-1 border-l dark:border-slate-600 align-top min-w-[120px]"
                              >
                                {period && (
                                  <div
                                    className={`p-2 rounded border text-xs ${getSubjectColor(
                                      period.subject.name
                                    )}`}
                                  >
                                    <div className="font-semibold truncate">
                                      {period.subject.name}
                                    </div>
                                    <div className="opacity-75 truncate mt-0.5">
                                      {period.teacher.fullName}
                                    </div>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Legend */}
          {timetable.length > 0 && (
            <div className="mt-6 bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-4">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Subjects This Term
              </h3>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(timetable.map((p) => p.subject.name))).map((subject) => (
                  <span
                    key={subject}
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${getSubjectColor(
                      subject
                    )}`}
                  >
                    {subject}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ParentTimetable;
