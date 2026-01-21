import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import Subjects from '../subjects/Subjects';
import Classes from '../classes/Classes';
import Terms from '../terms/Terms';
import Assessments from './Assessments';
import GradingScales from './GradingScales';
import ReportCards from './ReportCards';
import Timetable from './Timetable';
import Promotions from './Promotions';
import LessonPlanner from './LessonPlanner';

const Academics = () => {
  const { user } = useAuth();
  const [view, setView] = useState('');

  const allTabs = [
    { id: 'assessments', label: 'Assessments', roles: ['SUPER_ADMIN', 'TEACHER'] },
    { id: 'reports', label: 'Report Cards', roles: ['SUPER_ADMIN', 'TEACHER', 'SECRETARY'] },
    { id: 'lesson-planner', label: 'Lesson Planner', roles: ['SUPER_ADMIN', 'TEACHER'] },
    { id: 'timetable', label: 'Timetable', roles: ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY', 'PARENT', 'STUDENT'] },
    { id: 'classes', label: 'Classes', roles: ['SUPER_ADMIN', 'SECRETARY'] },
    { id: 'subjects', label: 'Subjects', roles: ['SUPER_ADMIN'] },
    { id: 'grading', label: 'Grading Scales', roles: ['SUPER_ADMIN'] },
    { id: 'terms', label: 'Terms', roles: ['SUPER_ADMIN'] },
    { id: 'promotions', label: 'Promotions', roles: ['SUPER_ADMIN'] },
  ];

  const allowedTabs = allTabs.filter(tab =>
    user && (tab.roles.includes(user.role) || user.role === 'SUPER_ADMIN')
  );

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
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Academic Management</h1>

        <div className="bg-white dark:bg-slate-800 p-1 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-wrap gap-1">
          {allowedTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id as any)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${view === tab.id
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[400px]">
        {/* Render only if role allows to prevent unauthorized access via state manipulation */}
        {view === 'classes' && allowedTabs.find(t => t.id === 'classes') && <Classes />}
        {view === 'subjects' && allowedTabs.find(t => t.id === 'subjects') && <Subjects />}
        {view === 'assessments' && allowedTabs.find(t => t.id === 'assessments') && <Assessments />}
        {view === 'grading' && allowedTabs.find(t => t.id === 'grading') && <GradingScales />}
        {view === 'reports' && allowedTabs.find(t => t.id === 'reports') && <ReportCards />}
        {view === 'timetable' && allowedTabs.find(t => t.id === 'timetable') && <Timetable />}
        {view === 'lesson-planner' && allowedTabs.find(t => t.id === 'lesson-planner') && <LessonPlanner />}
        {view === 'terms' && allowedTabs.find(t => t.id === 'terms') && <Terms />}
        {view === 'promotions' && allowedTabs.find(t => t.id === 'promotions') && <Promotions />}
      </div>
    </div>
  );
};

export default Academics;
