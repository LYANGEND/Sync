import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, ChevronDown, ArrowRight } from 'lucide-react';
import type { MasterAIAction } from '../../services/masterAIService';
import { SmartDataDisplay } from './DataDisplay';

// Where to see the result of each tool in the app
const ACTION_LINK_GROUPS: [to: string, label: string, tools: string[]][] = [
  ['/academics?tab=calendar', 'Calendar', ['add_calendar_events', 'list_calendar_events', 'delete_calendar_events']],
  ['/students', 'Students', ['create_students', 'search_students']],
  ['/classes', 'Classes', ['create_classes', 'list_classes', 'assign_subjects_to_classes', 'cleanup_class_subjects']],
  ['/subjects', 'Subjects', ['create_subjects', 'list_subjects', 'list_topics', 'generate_syllabus', 'populate_all_syllabi', 'cleanup_invalid_syllabi', 'create_topics', 'delete_topics']],
  ['/academics?tab=lesson-plans&view=plans', 'Lesson plans', ['generate_lesson_plans', 'list_lesson_plans', 'get_lesson_plan_content']],
  ['/academics?tab=lesson-plans', 'Syllabus coverage', ['check_syllabus_progress']],
  ['/academics?tab=assessments', 'Assessments', ['generate_assessments', 'create_assessments']],
  ['/academics?tab=homework', 'Homework', ['generate_homework']],
  ['/academics/gradebook', 'Gradebook', ['get_class_insights']],
  ['/academics?tab=reports', 'Report cards', ['generate_report_remarks']],
  ['/academics?tab=terms', 'Terms', ['create_academic_terms']],
  ['/academics?tab=timetable', 'Timetable', ['create_timetable_periods']],
  ['/finance', 'Finance', ['create_fee_templates', 'list_fee_templates', 'create_scholarships', 'create_expenses', 'search_payments', 'get_payment_analytics', 'get_student_payment_history', 'get_student_fee_balances', 'get_invoice_summary']],
  ['/users', 'Users', ['list_users']],
  ['/communication', 'Communication', ['create_announcements', 'send_notifications', 'send_sms']],
];
const ACTION_LINKS = new Map(ACTION_LINK_GROUPS.flatMap(([to, label, tools]) => tools.map(tool => [tool, { to, label }] as const)));

export const ActionResult = ({ action }: { action: MasterAIAction }) => {
  const [expanded, setExpanded] = useState(false); // Collapsed by default — message is the hero
  const hasData = !!action.data;
  const link = action.success ? ACTION_LINKS.get(action.tool) : undefined;

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        action.success
          ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/30'
          : 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30'
      }`}
    >
      {/* Header */}
      <div className="flex items-center">
        <button
          type="button"
          disabled={!hasData}
          aria-expanded={hasData ? expanded : undefined}
          className="flex-1 min-w-0 text-left flex items-center justify-between px-2.5 md:px-3 py-2 md:py-2.5 enabled:cursor-pointer enabled:hover:bg-white/30 dark:enabled:hover:bg-slate-800/30 transition-colors gap-2"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-1.5 md:gap-2 min-w-0 flex-1">
            {action.success ? (
              <CheckCircle2 size={14} className="md:w-4 md:h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            ) : (
              <XCircle size={14} className="md:w-4 md:h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
            )}
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{action.summary}</span>
          </div>
          {hasData && (
            <ChevronDown size={14} className={`text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
          )}
        </button>
        {link && (
          <Link
            to={link.to}
            className="flex-shrink-0 inline-flex items-center gap-0.5 px-2.5 md:px-3 py-2 text-xs font-medium text-primary hover:underline"
            aria-label={`Open ${link.label}`}
          >
            {link.label} <ArrowRight size={12} aria-hidden="true" />
          </Link>
        )}
      </div>

      {/* Error */}
      {action.error && !action.success && (
        <p className="text-xs text-red-600 dark:text-red-400 px-2.5 md:px-3 pb-2 ml-5 md:ml-6">
          {action.error}
        </p>
      )}

      {/* Smart Data Display */}
      {expanded && action.data && (
        <div className="px-2.5 md:px-3 pb-2.5 md:pb-3">
          <SmartDataDisplay data={action.data} toolName={action.tool} />
        </div>
      )}
    </div>
  );
};
