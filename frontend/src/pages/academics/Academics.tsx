import { useState, useEffect } from 'react';
import { PageHeader, Tabs, TabPanel } from '../../components/ui/DesignSystem';
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
import TeacherGradebook, { type GradebookEditState } from './TeacherGradebook';
import { academicTabsForRole } from '../../utils/academicNavigation';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import SubjectAllocation from './SubjectAllocation';

const Academics = () => {
  const { user } = useAuth();
  const [view, setView] = useState('');

  const { confirm } = useAppDialog();
  const [gradebookState, setGradebookState] = useState<GradebookEditState>({ dirty: false, saving: false });
  const allowedTabs = academicTabsForRole(user?.role || '');

  const changeTab = async (nextView: string) => {
    if (nextView === view || gradebookState.saving) return;
    if (gradebookState.dirty && !await confirm({
      title: 'Leave the gradebook?',
      message: 'You have unsaved scores. Stay to save them, or discard the changes and switch modules.',
      confirmText: 'Discard and switch', cancelText: 'Stay in gradebook', destructive: true,
    })) return;
    setView(nextView);
  };

  useEffect(() => {
    // If current view is not in allowed tabs, defaults to first allowed
    if (allowedTabs.length > 0) {
      if (!view || !allowedTabs.find(t => t.id === view)) {
        setView(allowedTabs[0].id);
      }
    }
  }, [user, allowedTabs.length, view]);

  if (!user) return null;

  return (
    <div className="ds-page">
      <PageHeader title="Academics" description="Manage teaching, classes, assessments, and the school calendar." />
      <Tabs id="academics" label="Academic modules" items={allowedTabs.map(tab => ({ ...tab, disabled: gradebookState.saving && tab.id !== view }))} value={view} onChange={changeTab} />
      {view && <TabPanel id="academics" value={view}>
            {/* Render only if role allows to prevent unauthorized access via state manipulation */}
            {view === 'classes' && allowedTabs.find(t => t.id === 'classes') && <Classes />}
            {view === 'subjects' && allowedTabs.find(t => t.id === 'subjects') && <Subjects />}
            {view === 'grading' && allowedTabs.find(t => t.id === 'grading') && <GradingScales />}
            {view === 'reports' && allowedTabs.find(t => t.id === 'reports') && <ReportCards />}
            {view === 'timetable' && allowedTabs.find(t => t.id === 'timetable') && <Timetable />}
            {view === 'terms' && allowedTabs.find(t => t.id === 'terms') && <Terms />}
            {view === 'promotions' && allowedTabs.find(t => t.id === 'promotions') && <Promotions />}
            {view === 'calendar' && allowedTabs.find(t => t.id === 'calendar') && <AcademicCalendar />}
            {view === 'attendance' && allowedTabs.find(t => t.id === 'attendance') && <AttendanceRegister />}
            {view === 'gradebook' && allowedTabs.find(t => t.id === 'gradebook') && <TeacherGradebook embedded onEditStateChange={setGradebookState} />}
            {view === 'allocation' && allowedTabs.find(t => t.id === 'allocation') && <SubjectAllocation />}
      </TabPanel>}
    </div>
  );
};

export default Academics;
