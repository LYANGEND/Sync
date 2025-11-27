import React, { useState } from 'react';
import { BookOpen, Users, Calendar, FileText, Award, ClipboardList, Clock, TrendingUp } from 'lucide-react';
import Subjects from '../subjects/Subjects';
import Classes from '../classes/Classes';
import Terms from '../terms/Terms';
import Assessments from './Assessments';
import GradingScales from './GradingScales';
import ReportCards from './ReportCards';
import Timetable from './Timetable';
import Promotions from './Promotions';

const Academics = () => {
  const [view, setView] = useState<'classes' | 'subjects' | 'terms' | 'assessments' | 'grading' | 'reports' | 'timetable' | 'promotions'>('classes');

  const tabs = [
    { id: 'classes', label: 'Classes', icon: Users },
    { id: 'subjects', label: 'Subjects', icon: BookOpen },
    { id: 'timetable', label: 'Timetable', icon: Clock },
    { id: 'assessments', label: 'Assessments', icon: ClipboardList },
    { id: 'grading', label: 'Grading', icon: Award },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'terms', label: 'Terms', icon: Calendar },
    { id: 'promotions', label: 'Promotions', icon: TrendingUp },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Academic Management</h1>
      </div>

      {/* Mobile Tab Selector - Horizontal Scroll */}
      <div className="lg:hidden -mx-4 px-4">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all active:scale-95 ${
                  view === tab.id 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'bg-white text-gray-600 border border-gray-200'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop Tab Bar */}
      <div className="hidden lg:block">
        <div className="bg-white p-1.5 rounded-xl border border-gray-200 inline-flex flex-wrap gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  view === tab.id 
                    ? 'bg-blue-100 text-blue-700 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 min-h-[400px] overflow-hidden">
        {view === 'classes' && <Classes />}
        {view === 'subjects' && <Subjects />}
        {view === 'assessments' && <Assessments />}
        {view === 'grading' && <GradingScales />}
        {view === 'reports' && <ReportCards />}
        {view === 'timetable' && <Timetable />}
        {view === 'terms' && <Terms />}
        {view === 'promotions' && <Promotions />}
      </div>
    </div>
  );
};

export default Academics;
