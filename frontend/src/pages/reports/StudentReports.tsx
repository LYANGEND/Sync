import React, { useState, useEffect } from 'react';
import { Users, Printer, Download } from 'lucide-react';
import api from '../../utils/api';

interface Student {
  index: number; id: string; admissionNumber: string; firstName: string; lastName: string;
  gender: string; dateOfBirth: string; guardianName: string; guardianPhone: string;
}

interface EnrollmentStats {
  total: number; active: number;
  byStatus: { ACTIVE: number; TRANSFERRED: number; GRADUATED: number; DROPPED_OUT: number };
  byGender: { MALE: number; FEMALE: number };
  byGrade: { grade: number; count: number }[];
}

const StudentReports = () => {
  const [reportType, setReportType] = useState<'roster' | 'enrollment'>('roster');
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [roster, setRoster] = useState<{ className: string; teacher: string; studentCount: number; students: Student[] } | null>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentStats | null>(null);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (reportType === 'roster' && selectedClass) fetchRoster();
    else if (reportType === 'enrollment') fetchEnrollment();
  }, [reportType, selectedClass]);

  const fetchClasses = async () => {
    try {
      const res = await api.get('/classes');
      setClasses(res.data);
      if (res.data.length > 0) setSelectedClass(res.data[0].id);
    } catch (e) { console.error(e); }
  };

  const fetchRoster = async () => {
    if (!selectedClass) return;
    setLoading(true);
    try {
      const res = await api.get('/reports-hub/students/roster', { params: { classId: selectedClass } });
      setRoster(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchEnrollment = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports-hub/students/enrollment');
      setEnrollment(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { id: 'roster', label: 'Class Roster' },
          { id: 'enrollment', label: 'Enrollment Stats' },
        ].map((r) => (
          <button key={r.id} onClick={() => setReportType(r.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              reportType === r.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}>{r.label}</button>
        ))}
      </div>

      {/* Class Roster */}
      {reportType === 'roster' && (
        <>
          <div className="flex items-center gap-3">
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => window.print()} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2">
              <Printer size={16} /> Print
            </button>
          </div>

          {roster && (
            <div id="printable-report" className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50">
                <h3 className="font-semibold text-gray-800">{roster.className}</h3>
                <p className="text-sm text-gray-500">Teacher: {roster.teacher || 'Not assigned'} • {roster.studentCount} students</p>
              </div>

              <div className="lg:hidden divide-y divide-gray-100">
                {loading ? <div className="p-8 text-center text-gray-500">Loading...</div> :
                  roster.students.map((s) => (
                    <div key={s.id} className="p-4">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">{s.index}</span>
                        <div>
                          <p className="font-medium text-gray-900">{s.firstName} {s.lastName}</p>
                          <p className="text-xs text-gray-500">{s.admissionNumber} • {s.gender}</p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 w-12">#</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Admission #</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Gender</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Guardian</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Phone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {roster.students.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-center text-gray-500">{s.index}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.admissionNumber}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{s.firstName} {s.lastName}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{s.gender}</td>
                        <td className="px-4 py-3 text-gray-600">{s.guardianName}</td>
                        <td className="px-4 py-3 text-gray-600">{s.guardianPhone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Enrollment Statistics */}
      {reportType === 'enrollment' && enrollment && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-gray-100">
              <p className="text-xs text-gray-500">Total Students</p>
              <p className="text-2xl font-bold text-gray-800">{enrollment.total}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-100">
              <p className="text-xs text-gray-500">Active</p>
              <p className="text-2xl font-bold text-green-600">{enrollment.active}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-100">
              <p className="text-xs text-gray-500">Male</p>
              <p className="text-2xl font-bold text-blue-600">{enrollment.byGender.MALE}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-100">
              <p className="text-xs text-gray-500">Female</p>
              <p className="text-2xl font-bold text-pink-600">{enrollment.byGender.FEMALE}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Status */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h4 className="font-semibold text-gray-800 mb-4">By Status</h4>
              <div className="space-y-3">
                {Object.entries(enrollment.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{status.replace('_', ' ')}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${status === 'ACTIVE' ? 'bg-green-500' : status === 'GRADUATED' ? 'bg-blue-500' : 'bg-gray-400'}`}
                          style={{ width: `${(count / enrollment.total) * 100}%` }} />
                      </div>
                      <span className="text-sm font-medium text-gray-800 w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By Grade */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h4 className="font-semibold text-gray-800 mb-4">By Grade Level</h4>
              <div className="space-y-3">
                {enrollment.byGrade.map((g) => (
                  <div key={g.grade} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Grade {g.grade}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${(g.count / enrollment.active) * 100}%` }} />
                      </div>
                      <span className="text-sm font-medium text-gray-800 w-8 text-right">{g.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {loading && reportType === 'enrollment' && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-500">Loading...</div>
      )}
    </div>
  );
};

export default StudentReports;
