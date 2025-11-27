import React, { useState, useEffect } from 'react';
import { Calendar, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import api from '../../utils/api';

interface ClassSummary {
  classId: string; className: string; gradeLevel: number;
  present: number; absent: number; late: number; total: number; presentRate: number;
}

interface AbsentStudent {
  id: string; admissionNumber: string; firstName: string; lastName: string;
  className: string; guardianPhone: string; totalDays: number; absentDays: number; absentRate: number;
}

const AttendanceReports = () => {
  const [reportType, setReportType] = useState<'daily' | 'absenteeism'>('daily');
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [classSummary, setClassSummary] = useState<ClassSummary[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [absentStudents, setAbsentStudents] = useState<AbsentStudent[]>([]);

  useEffect(() => {
    if (reportType === 'daily') fetchDailySummary();
    else fetchAbsenteeism();
  }, [reportType, selectedDate]);

  const fetchDailySummary = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports-hub/attendance/summary', { params: { date: selectedDate } });
      setClassSummary(res.data.classes);
      setTotals(res.data.totals);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchAbsenteeism = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports-hub/attendance/absenteeism', { params: { threshold: 15 } });
      setAbsentStudents(res.data.students);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { id: 'daily', label: 'Daily Summary' },
          { id: 'absenteeism', label: 'Absenteeism Alert' },
        ].map((r) => (
          <button key={r.id} onClick={() => setReportType(r.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              reportType === r.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}>{r.label}</button>
        ))}
      </div>

      {/* Daily Summary */}
      {reportType === 'daily' && (
        <>
          <div className="flex items-center gap-3">
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>

          {totals && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Total Marked</p>
                <p className="text-xl font-bold text-gray-800">{totals.total}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Present</p>
                <p className="text-xl font-bold text-green-600">{totals.present}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Absent</p>
                <p className="text-xl font-bold text-red-600">{totals.absent}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-500">Late</p>
                <p className="text-xl font-bold text-yellow-600">{totals.late}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-100 col-span-2 lg:col-span-1">
                <p className="text-xs text-gray-500">Attendance Rate</p>
                <p className="text-xl font-bold text-blue-600">{totals.presentRate}%</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="lg:hidden divide-y divide-gray-100">
              {loading ? <div className="p-8 text-center text-gray-500">Loading...</div> :
                classSummary.length === 0 ? <div className="p-8 text-center text-gray-500">No attendance data</div> :
                classSummary.map((c) => (
                  <div key={c.classId} className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-medium text-gray-900">{c.className}</p>
                      <span className={`text-sm font-bold ${c.presentRate >= 90 ? 'text-green-600' : c.presentRate >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>{c.presentRate}%</span>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span className="text-green-600"><CheckCircle size={12} className="inline mr-1" />{c.present}</span>
                      <span className="text-red-600"><XCircle size={12} className="inline mr-1" />{c.absent}</span>
                      <span className="text-yellow-600"><Clock size={12} className="inline mr-1" />{c.late}</span>
                    </div>
                  </div>
                ))}
            </div>

            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Class</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Total</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Present</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Absent</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Late</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {classSummary.map((c) => (
                    <tr key={c.classId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{c.className}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{c.total}</td>
                      <td className="px-4 py-3 text-center text-green-600 font-medium">{c.present}</td>
                      <td className="px-4 py-3 text-center text-red-600 font-medium">{c.absent}</td>
                      <td className="px-4 py-3 text-center text-yellow-600 font-medium">{c.late}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${c.presentRate >= 90 ? 'bg-green-100 text-green-700' : c.presentRate >= 75 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{c.presentRate}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Absenteeism Alert */}
      {reportType === 'absenteeism' && (
        <>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-yellow-800">Absenteeism Alert</p>
              <p className="text-sm text-yellow-700">Students with 15%+ absence rate in the last 30 days</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="lg:hidden divide-y divide-gray-100">
              {loading ? <div className="p-8 text-center text-gray-500">Loading...</div> :
                absentStudents.length === 0 ? <div className="p-8 text-center text-green-600">No students with high absenteeism</div> :
                absentStudents.map((s) => (
                  <div key={s.id} className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-gray-900">{s.firstName} {s.lastName}</p>
                        <p className="text-xs text-gray-500">{s.className}</p>
                      </div>
                      <span className={`text-sm font-bold px-2 py-1 rounded-full ${s.absentRate >= 30 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{s.absentRate}% absent</span>
                    </div>
                    <p className="text-xs text-gray-500">{s.absentDays} of {s.totalDays} days absent</p>
                    <a href={`tel:${s.guardianPhone}`} className="text-xs text-blue-600 mt-1 block">{s.guardianPhone}</a>
                  </div>
                ))}
            </div>

            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Class</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Days Absent</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Total Days</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Absence Rate</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {absentStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{s.firstName} {s.lastName}</p>
                        <p className="text-xs text-gray-500">{s.admissionNumber}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.className}</td>
                      <td className="px-4 py-3 text-center font-medium text-red-600">{s.absentDays}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{s.totalDays}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${s.absentRate >= 30 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{s.absentRate}%</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.guardianPhone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AttendanceReports;
