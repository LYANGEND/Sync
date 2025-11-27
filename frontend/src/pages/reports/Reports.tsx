import React, { useState } from 'react';
import { FileText, DollarSign, Users, CalendarCheck, Download, Printer } from 'lucide-react';
import FinancialReports from './FinancialReports';
import AttendanceReports from './AttendanceReports';
import StudentReports from './StudentReports';

type ReportTab = 'financial' | 'attendance' | 'students';

const Reports = () => {
  const [activeTab, setActiveTab] = useState<ReportTab>('financial');

  const tabs = [
    { id: 'financial' as ReportTab, label: 'Financial', icon: DollarSign },
    { id: 'attendance' as ReportTab, label: 'Attendance', icon: CalendarCheck },
    { id: 'students' as ReportTab, label: 'Students', icon: Users },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Reports</h1>
          <p className="text-sm text-gray-500">Generate and view school reports</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap flex-1 sm:flex-none justify-center ${
              activeTab === tab.id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'financial' && <FinancialReports />}
      {activeTab === 'attendance' && <AttendanceReports />}
      {activeTab === 'students' && <StudentReports />}
    </div>
  );
};

export default Reports;
