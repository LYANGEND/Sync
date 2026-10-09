import React, { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Subjects from '../subjects/Subjects';
import Classes from '../classes/Classes';
import Terms from '../terms/Terms';
import GradingScales from './GradingScales';
import ReportCards from './ReportCards';
import Timetable from './Timetable';
import Promotions from './Promotions';
import AcademicCalendar from './AcademicCalendar';
import AttendanceRegister from './AttendanceRegister';
import TeacherGradebook from './TeacherGradebook';
import SubjectAllocation from './SubjectAllocation';
import TermRolloverPreparationPanel from '../../components/academics/TermRolloverPreparationPanel';
import TermRolloverEnrollmentPanel from '../../components/academics/TermRolloverEnrollmentPanel';
import TermRolloverReadinessPanel from '../../components/academics/TermRolloverReadinessPanel';

const ACADEMIC_GROUPS = [
  { id: 'daily', label: 'Daily' },
  { id: 'results', label: 'Results' },
  { id: 'setup', label: 'Setup' },
  { id: 'term-year', label: 'Term & Year' },
] as const;

type AcademicGroup = typeof ACADEMIC_GROUPS[number]['id'];

const ACADEMIC_TABS = [
  { id: 'gradebook', group: 'results', label: 'Gradebook', hint: 'Enter and review marks and assessments.', roles: ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY'] },
  { id: 'reports', group: 'results', label: 'Report Cards', hint: 'Build, review and finalise term report cards.', roles: ['SUPER_ADMIN', 'TEACHER', 'SECRETARY'] },
  { id: 'attendance', group: 'daily', label: 'Attendance', hint: 'Take and review daily class registers.', roles: ['SUPER_ADMIN', 'TEACHER', 'SECRETARY'] },
  { id: 'timetable', group: 'daily', label: 'Timetable', hint: 'View and edit class and teacher timetables.', roles: ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY', 'PARENT'] },
  { id: 'calendar', group: 'daily', label: 'Calendar', hint: 'School days, holidays and events.', roles: ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY', 'PARENT'] },
  { id: 'classes', group: 'setup', label: 'Classes', hint: 'Classes for each term and the pupils in them.', roles: ['SUPER_ADMIN', 'SECRETARY'] },
  { id: 'subjects', group: 'setup', label: 'Subjects', hint: 'Subjects and their syllabus outlines.', roles: ['SUPER_ADMIN'] },
  { id: 'allocation', group: 'setup', label: 'Allocation', hint: 'Assign teachers to subjects and classes.', roles: ['SUPER_ADMIN'] },
  { id: 'grading', group: 'results', label: 'Grading Scales', hint: 'Grade boundaries used for results and reports.', roles: ['SUPER_ADMIN'] },
  { id: 'terms', group: 'term-year', label: 'Terms', hint: 'Create terms and move them through their lifecycle.', roles: ['SUPER_ADMIN'] },
  { id: 'term-preparation', group: 'term-year', label: 'Term Preparation', hint: 'Set up the next term’s classes and settings.', roles: ['SUPER_ADMIN'] },
  { id: 'enrollment-staging', group: 'term-year', label: 'Enrollment', hint: 'Choose each pupil’s class for the next term.', roles: ['SUPER_ADMIN'] },
  { id: 'rollover-readiness', group: 'term-year', label: 'Rollover Readiness', hint: 'Check that everything is ready before switching terms.', roles: ['SUPER_ADMIN'] },
  { id: 'promotions', group: 'term-year', label: 'Promotions', hint: 'Review results and recommended promote or retain outcomes.', roles: ['SUPER_ADMIN'] },
] as const;

type AcademicView = typeof ACADEMIC_TABS[number]['id'];

const Academics = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabRefs = useRef<Partial<Record<AcademicView, HTMLButtonElement | null>>>({});

  const allowedTabs = ACADEMIC_TABS.filter(tab =>
    user && (tab.roles.some(role => role === user.role) || user.role === 'SUPER_ADMIN')
  );
  const requestedView = searchParams.get('tab');
  const view = (allowedTabs.some(tab => tab.id === requestedView)
    ? requestedView
    : allowedTabs[0]?.id) as AcademicView | undefined;
  const currentTab = allowedTabs.find(tab => tab.id === view);
  const visibleGroups = ACADEMIC_GROUPS.filter(group => allowedTabs.some(tab => tab.group === group.id));
  const activeGroup: AcademicGroup | undefined = currentTab?.group;
  const groupTabs = allowedTabs.filter(tab => tab.group === activeGroup);

  useEffect(() => {
    if (view && requestedView !== view) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('tab', view);
      setSearchParams(nextParams, { replace: true });
    }
  }, [requestedView, searchParams, setSearchParams, view]);

  const selectView = (nextView: AcademicView) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', nextView);
    setSearchParams(nextParams);
  };

  useEffect(() => {
    if (view) tabRefs.current[view]?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [view]);

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (groupTabs.length === 0) return;
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % groupTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + groupTabs.length) % groupTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = groupTabs.length - 1;
    else return;

    event.preventDefault();
    const nextView = groupTabs[nextIndex].id;
    selectView(nextView);
    requestAnimationFrame(() => tabRefs.current[nextView]?.focus());
  };

  const selectGroup = (groupId: AcademicGroup) => {
    const first = allowedTabs.find(tab => tab.group === groupId);
    if (first) selectView(first.id);
  };

  if (!user) return null;

  return (
    <div className="pb-24 md:pb-6">
      <div className="px-4 pt-4 md:px-6 md:pt-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Academic Management</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage teaching, results, attendance, schedules, and academic setup.</p>
        </div>

        {visibleGroups.length > 1 && (
          <nav aria-label="Academic management areas" className="mb-3 flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {visibleGroups.map(group => (
              <button
                key={group.id}
                type="button"
                onClick={() => selectGroup(group.id)}
                aria-current={activeGroup === group.id ? 'page' : undefined}
                className={`min-h-11 flex-none whitespace-nowrap rounded-full px-4 text-sm font-bold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${activeGroup === group.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-surface-hover-strong dark:bg-slate-800 dark:text-slate-300'}`}
              >
                {group.label}
              </button>
            ))}
          </nav>
        )}

        <div className="overflow-x-auto pb-2 [scrollbar-width:thin]">
          <div className="inline-flex min-w-full gap-1 rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800" role="tablist" aria-label={`${ACADEMIC_GROUPS.find(group => group.id === activeGroup)?.label ?? 'Academic'} sections`}>
          {groupTabs.map((tab, index) => (
            <button
              key={tab.id}
              ref={(element) => { tabRefs.current[tab.id] = element; }}
              id={`academic-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              aria-controls="academic-tab-panel"
              tabIndex={view === tab.id ? 0 : -1}
              onClick={() => selectView(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`min-h-11 flex-none whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${view === tab.id
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-surface-hover'
                }`}
            >
              {tab.label}
            </button>
          ))}
          </div>
        </div>
        {currentTab && <p className="mt-1 px-1 text-sm text-slate-500 dark:text-slate-400">{currentTab.hint}</p>}
      </div>

      <div id="academic-tab-panel" role="tabpanel" aria-labelledby={view ? `academic-tab-${view}` : undefined} className="min-h-[400px]">
        {/* Render only if role allows to prevent unauthorized access via state manipulation */}
        {view === 'classes' && allowedTabs.find(t => t.id === 'classes') && <Classes />}
        {view === 'subjects' && allowedTabs.find(t => t.id === 'subjects') && <Subjects />}
        {view === 'grading' && allowedTabs.find(t => t.id === 'grading') && <GradingScales />}
        {view === 'reports' && allowedTabs.find(t => t.id === 'reports') && <ReportCards />}
        {view === 'timetable' && allowedTabs.find(t => t.id === 'timetable') && <Timetable />}
        {view === 'terms' && allowedTabs.find(t => t.id === 'terms') && <Terms />}
        {view === 'term-preparation' && allowedTabs.find(t => t.id === 'term-preparation') && <TermRolloverPreparationPanel />}
        {view === 'enrollment-staging' && allowedTabs.find(t => t.id === 'enrollment-staging') && <TermRolloverEnrollmentPanel onNavigate={selectView} />}
        {view === 'rollover-readiness' && allowedTabs.find(t => t.id === 'rollover-readiness') && <TermRolloverReadinessPanel />}
        {view === 'promotions' && allowedTabs.find(t => t.id === 'promotions') && <Promotions />}
        {view === 'calendar' && allowedTabs.find(t => t.id === 'calendar') && <AcademicCalendar />}
        {view === 'attendance' && allowedTabs.find(t => t.id === 'attendance') && <AttendanceRegister />}
        {view === 'gradebook' && allowedTabs.find(t => t.id === 'gradebook') && <TeacherGradebook />}
        {view === 'allocation' && allowedTabs.find(t => t.id === 'allocation') && <SubjectAllocation />}
      </div>
    </div>
  );
};

export default Academics;
