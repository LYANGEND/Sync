import {
  Sparkles, Calendar, BookOpen, GraduationCap, BarChart3, Trash2,
  Users, Building2, Wallet, CalendarDays, RefreshCw, Info, AlertTriangle,
} from 'lucide-react';

// ==========================================
// SMART DATA FORMATTER — Human-readable rendering of tool results
// ==========================================

/** Format a date string nicely */
const formatDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return d; }
};

/** Format currency */
const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-ZM', { style: 'currency', currency: 'ZMW', minimumFractionDigits: 0 }).format(n);

/** Render a key-value stat row */
const StatRow = ({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) => (
  <div className="flex items-center justify-between py-1.5 md:py-2 px-2 md:px-3 rounded-lg bg-white/60 dark:bg-slate-800/60">
    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 md:gap-2 truncate">
      {icon && <span className="flex-shrink-0 text-primary">{icon}</span>}
      <span className="truncate">{label}</span>
    </span>
    <span className="text-xs md:text-sm font-semibold text-gray-900 dark:text-white flex-shrink-0 ml-2">{value}</span>
  </div>
);

/** Human-friendly label from camelCase / snake_case keys */
const humanizeKey = (key: string): string => {
  const map: Record<string, string> = {
    activeStudents: 'Active Students',
    activeTeachers: 'Active Teachers',
    totalClasses: 'Total Classes',
    totalSubjects: 'Total Subjects',
    totalTerms: 'Academic Terms',
    totalCalendarEvents: 'Calendar Events',
    totalRevenue: 'Total Revenue',
    attendanceRate: 'Attendance Rate',
    firstName: 'First Name',
    lastName: 'Last Name',
    admissionNumber: 'Admission No.',
    dateOfBirth: 'Date of Birth',
    enrollmentDate: 'Enrollment Date',
    feeAmount: 'Fee Amount',
    startDate: 'Start Date',
    endDate: 'End Date',
    eventType: 'Type',
    createdAt: 'Created',
    updatedAt: 'Updated',
    expenseNumber: 'Expense No.',
    isActive: 'Active',
    gradeLevel: 'Grade Level',
  };
  if (map[key]) return map[key];
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
};

/** Stat icon by key */
const STAT_ICONS: Record<string, typeof Calendar> = {
  activeStudents: GraduationCap,
  activeTeachers: Users,
  totalClasses: Building2,
  totalSubjects: BookOpen,
  totalTerms: Calendar,
  totalCalendarEvents: CalendarDays,
  totalRevenue: Wallet,
  attendanceRate: BarChart3,
};

const statIcon = (key: string): React.ReactNode => {
  const Icon = STAT_ICONS[key];
  return Icon ? <Icon size={14} aria-hidden="true" /> : null;
};

/** Render statistics object as a nice grid */
const StatsDisplay = ({ data }: { data: Record<string, any> }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 md:gap-2">
    {Object.entries(data)
      .filter(([k]) => !['id', 'schoolId', 'createdAt', 'updatedAt'].includes(k))
      .map(([key, value]) => (
        <StatRow key={key} label={humanizeKey(key)} value={value} icon={statIcon(key)} />
      ))}
  </div>
);

/** Render an array of items as a clean list */
const ItemListDisplay = ({ items, toolName }: { items: any[]; toolName: string }) => {
  // Determine which fields to show based on tool type
  const getDisplayFields = (): { key: string; label: string }[] => {
    if (toolName.includes('calendar') || toolName.includes('event')) {
      return [
        { key: 'title', label: 'Event' },
        { key: 'startDate', label: 'Date' },
        { key: 'eventType', label: 'Type' },
      ];
    }
    if (toolName.includes('student')) {
      return [
        { key: 'firstName', label: 'Name' },
        { key: 'admissionNumber', label: 'Admission No.' },
        { key: 'status', label: 'Status' },
      ];
    }
    if (toolName.includes('class')) {
      return [
        { key: 'name', label: 'Class Name' },
        { key: 'gradeLevel', label: 'Grade' },
        { key: 'capacity', label: 'Capacity' },
      ];
    }
    if (toolName.includes('subject')) {
      return [
        { key: 'name', label: 'Subject' },
        { key: 'code', label: 'Code' },
      ];
    }
    if (toolName.includes('fee')) {
      return [
        { key: 'name', label: 'Fee Name' },
        { key: 'amount', label: 'Amount' },
        { key: 'frequency', label: 'Frequency' },
      ];
    }
    if (toolName.includes('scholarship')) {
      return [
        { key: 'name', label: 'Scholarship' },
        { key: 'percentage', label: 'Discount' },
      ];
    }
    if (toolName.includes('expense')) {
      return [
        { key: 'description', label: 'Description' },
        { key: 'amount', label: 'Amount' },
        { key: 'category', label: 'Category' },
      ];
    }
    if (toolName.includes('term')) {
      return [
        { key: 'name', label: 'Term' },
        { key: 'startDate', label: 'Start' },
        { key: 'endDate', label: 'End' },
      ];
    }
    if (toolName.includes('announcement')) {
      return [
        { key: 'title', label: 'Title' },
        { key: 'priority', label: 'Priority' },
      ];
    }
    if (toolName.includes('user')) {
      return [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role' },
      ];
    }
    if (toolName.includes('timetable') || toolName.includes('period')) {
      return [
        { key: 'dayOfWeek', label: 'Day' },
        { key: 'startTime', label: 'Start' },
        { key: 'endTime', label: 'End' },
      ];
    }
    // Generic fallback
    return Object.keys(items[0] || {})
      .filter(k => !['id', 'schoolId', 'createdAt', 'updatedAt', 'userId', 'classId', 'subjectId', 'teacherId', 'termId'].includes(k))
      .slice(0, 3)
      .map(k => ({ key: k, label: humanizeKey(k) }));
  };

  const fields = getDisplayFields();
  const displayItems = items.slice(0, 20); // Cap at 20 for readability
  const hasMore = items.length > 20;

  const formatValue = (item: any, key: string): string => {
    const val = item[key];
    if (val === null || val === undefined) return '—';
    if (key === 'firstName') return `${item.firstName || ''} ${item.lastName || ''}`.trim();
    if (key === 'amount' || key === 'feeAmount') return formatCurrency(Number(val));
    if (key === 'percentage') return `${val}%`;
    if (key === 'startDate' || key === 'endDate' || key === 'date') return formatDate(String(val));
    if (key === 'eventType' || key === 'status' || key === 'category' || key === 'frequency' || key === 'priority' || key === 'role') {
      return String(val).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
  };

  return (
    <div className="space-y-1 overflow-x-auto">
      {/* Header row */}
      <div className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 min-w-max">
        {fields.map(f => (
          <span key={f.key} className="flex-1 min-w-[80px] md:min-w-[100px] text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider truncate">
            {f.label}
          </span>
        ))}
      </div>
      {/* Data rows */}
      {displayItems.map((item, idx) => (
        <div key={item.id || idx} className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-lg bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 transition-colors min-w-max">
          {fields.map(f => (
            <span key={f.key} className="flex-1 min-w-[80px] md:min-w-[100px] text-xs text-gray-700 dark:text-gray-300 truncate">
              {formatValue(item, f.key)}
            </span>
          ))}
        </div>
      ))}
      {hasMore && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-1">
          ... and {items.length - 20} more items
        </p>
      )}
    </div>
  );
};

/** Smart data renderer — picks the best visualization for the data type */
export const SmartDataDisplay = ({ data, toolName }: { data: any; toolName: string }) => {
  if (!data) return null;

  // Stats tool — plain object with numeric values
  if (toolName === 'get_school_statistics' || (typeof data === 'object' && !Array.isArray(data) && !data.created && !data.deleted && !data.summary)) {
    return <StatsDisplay data={data} />;
  }

  // Resilient format: { created: [], updated?: [], existing?: [], errors: [], summary: string }
  if (data.created || data.updated || data.existing) {
    const sections: { label: string; Icon: typeof Calendar; items: any[] }[] = [];
    if (data.created?.length) sections.push({ label: 'Newly Created', Icon: Sparkles, items: data.created });
    if (data.updated?.length) sections.push({ label: 'Updated', Icon: RefreshCw, items: data.updated });
    if (data.existing?.length) sections.push({ label: 'Already Existed', Icon: Info, items: data.existing });

    return (
      <div className="space-y-2 md:space-y-3">
        {sections.map(sec => (
          <div key={sec.label}>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1.5 md:px-2 mb-1 flex items-center gap-1.5">
              <sec.Icon size={12} aria-hidden="true" /> {sec.label} ({sec.items.length})
            </p>
            <ItemListDisplay items={sec.items} toolName={toolName} />
          </div>
        ))}
        {data.errors?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-500 uppercase tracking-wider px-1.5 md:px-2 mb-1 flex items-center gap-1.5">
              <AlertTriangle size={12} aria-hidden="true" /> Issues ({data.errors.length})
            </p>
            <div className="space-y-1">
              {data.errors.map((err: string, i: number) => (
                <p key={i} className="text-xs text-red-500 dark:text-red-400 px-2 md:px-3 py-1.5 rounded-lg bg-red-50/50 dark:bg-red-900/10">
                  {err}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Array of items (list tools)
  if (Array.isArray(data) && data.length > 0) {
    return <ItemListDisplay items={data} toolName={toolName} />;
  }

  // Delete result
  if (typeof data?.deleted === 'number') {
    return (
      <div className="px-2 md:px-3 py-1.5 md:py-2 rounded-lg bg-white/60 dark:bg-slate-800/60">
        <p className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <Trash2 size={12} aria-hidden="true" /> {data.deleted} item{data.deleted !== 1 ? 's' : ''} removed
        </p>
      </div>
    );
  }

  // Fallback — simple key-value for plain objects
  if (typeof data === 'object' && !Array.isArray(data)) {
    const entries = Object.entries(data).filter(([k]) => !['id', 'schoolId'].includes(k));
    if (entries.length > 0 && entries.length <= 12) {
      return <StatsDisplay data={data} />;
    }
  }

  // Last resort — formatted text (not raw JSON)
  return (
    <div className="px-2 md:px-3 py-1.5 md:py-2 rounded-lg bg-white/60 dark:bg-slate-800/60">
      <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words">
        {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
      </p>
    </div>
  );
};
