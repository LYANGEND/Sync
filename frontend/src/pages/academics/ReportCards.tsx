import React, { useState, useEffect } from 'react';
import { FileText, Users, AlertCircle, CheckCircle, Printer } from 'lucide-react';
import { reportCardService, StudentReport } from '../../services/reportCardService';
import api from '../../utils/api';

interface Class {
  id: string;
  name: string;
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
}

interface Term {
  id: string;
  name: string;
  startDate: string;
}

const ReportCards: React.FC = () => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  
  const [report, setReport] = useState<StudentReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [teacherRemark, setTeacherRemark] = useState('');
  const [principalRemark, setPrincipalRemark] = useState('');
  const [savingRemarks, setSavingRemarks] = useState(false);
  const reportRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (report && reportRef.current) {
      reportRef.current.scrollIntoView({ behavior: 'smooth' });
      setTeacherRemark(report.classTeacherRemark || '');
      setPrincipalRemark(report.principalRemark || '');
    }
  }, [report]);

  const handleSaveRemarks = async () => {
    if (!report) return;
    
    try {
      setSavingRemarks(true);
      await reportCardService.updateReportRemarks(report.studentId, report.termId, {
        classTeacherRemark: teacherRemark,
        principalRemark: principalRemark
      });
      setSuccess('Remarks updated successfully');
      // Update local state
      setReport(prev => prev ? { ...prev, classTeacherRemark: teacherRemark, principalRemark: principalRemark } : null);
    } catch (err: any) {
      setError('Failed to update remarks');
    } finally {
      setSavingRemarks(false);
    }
  };

  useEffect(() => {
    if (selectedClass) {
      fetchStudents(selectedClass);
    } else {
      setStudents([]);
    }
  }, [selectedClass]);

  const fetchInitialData = async () => {
    try {
      const [classesRes, termsRes] = await Promise.all([
        api.get('/classes'),
        api.get('/academic-terms')
      ]);
      setClasses(classesRes.data);
      setTerms(termsRes.data);
    } catch (err) {
      console.error('Failed to fetch initial data', err);
    }
  };

  const fetchStudents = async (classId: string) => {
    try {
      const response = await api.get(`/classes/${classId}/students`);
      setStudents(response.data);
    } catch (err) {
      console.error('Failed to fetch students', err);
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedStudent || !selectedTerm) return;

    try {
      setGenerating(true);
      setError(null);
      setSuccess(null);
      const data = await reportCardService.generateStudentReport(selectedStudent, selectedTerm);
      setReport(data);
      setSuccess('Report generated successfully');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateClassReports = async () => {
    if (!selectedClass || !selectedTerm) return;

    try {
      setGenerating(true);
      setError(null);
      setSuccess(null);
      const data = await reportCardService.generateClassReports(selectedClass, selectedTerm);
      setSuccess(`Successfully generated reports for ${data.count} students`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate class reports');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6">Report Cards</h2>

      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 mb-4 sm:mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Academic Term</label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
            >
              <option value="">Select Term</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name} ({new Date(term.startDate).getFullYear()})
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
            <select
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setSelectedStudent('');
              }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
            >
              <option value="">Select Class</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>
          
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
            <select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              disabled={!selectedClass}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400 text-base"
            >
              <option value="">None (Select for individual)</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.firstName} {student.lastName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Mobile: Stack buttons vertically */}
        <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleGenerateReport}
            disabled={!selectedStudent || !selectedTerm || generating}
            className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed active:scale-98"
          >
            <FileText size={20} />
            {generating && selectedStudent ? 'Generating...' : 'Student Report'}
          </button>
          <button
            onClick={handleGenerateClassReports}
            disabled={!selectedClass || !selectedTerm || generating}
            className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed active:scale-98"
          >
            <Users size={20} />
            {generating && !selectedStudent ? 'Generating...' : 'Class Reports'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 sm:p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-start gap-2">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <span className="flex-1 text-sm sm:text-base">{error}</span>
            <button onClick={() => setError(null)} className="flex-shrink-0"><div className="sr-only">Close</div></button>
          </div>
        )}
        {success && (
          <div className="mt-4 p-3 sm:p-4 bg-green-50 text-green-700 rounded-lg border border-green-200 flex items-start gap-2">
            <CheckCircle size={20} className="flex-shrink-0 mt-0.5" />
            <span className="flex-1 text-sm sm:text-base">{success}</span>
            <button onClick={() => setSuccess(null)} className="flex-shrink-0"><div className="sr-only">Close</div></button>
          </div>
        )}
      </div>

      {report && (
        <div id="printable-report" ref={reportRef} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Report Header */}
          <div className="p-4 sm:p-6 lg:p-8 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Sync School</h1>
                <p className="text-gray-500 text-sm sm:text-base">Official Term Report</p>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-xs sm:text-sm text-gray-500 mb-1">Generated on</div>
                <div className="font-medium text-gray-900">{new Date().toLocaleDateString()}</div>
              </div>
            </div>

            {/* Student Info Grid - Mobile Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 p-4 sm:p-6 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Student</div>
                <div className="font-medium text-gray-900 text-sm sm:text-base truncate">{report.student?.firstName} {report.student?.lastName}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Adm. No.</div>
                <div className="font-medium text-gray-900 text-sm sm:text-base">{report.student?.admissionNumber || '-'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Class</div>
                <div className="font-medium text-gray-900 text-sm sm:text-base">{report.class?.name}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Term</div>
                <div className="font-medium text-gray-900 text-sm sm:text-base">{report.term?.name}</div>
              </div>
            </div>
          </div>

          {/* Performance Header */}
          <div className="p-4 sm:p-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Academic Performance</h3>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <button 
                onClick={() => window.print()} 
                className="print:hidden flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Printer size={18} />
                <span className="text-sm font-medium hidden sm:inline">Print</span>
              </button>
              <div className="px-3 sm:px-4 py-2 bg-blue-50 rounded-lg border border-blue-100 flex-1 sm:flex-none text-center sm:text-left">
                <span className="text-xs sm:text-sm text-blue-600 font-medium mr-1 sm:mr-2">Avg:</span>
                <span className="text-lg sm:text-xl font-bold text-blue-700">
                  {report.averageScore ? Number(report.averageScore).toFixed(1) : '0.0'}%
                </span>
              </div>
            </div>
          </div>
          
          {/* Results - Mobile Card View / Desktop Table */}
          {report.results && report.results.length > 0 ? (
            <>
              {/* Mobile Card View */}
              <div className="sm:hidden divide-y divide-gray-200">
                {report.results.map((result) => (
                  <div key={result.id} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-gray-900">{result.subjectName}</span>
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs font-semibold">
                        {result.grade}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Score</span>
                      <span className="font-medium text-gray-700">{Number(result.totalScore).toFixed(1)}%</span>
                    </div>
                    {result.remarks && (
                      <p className="text-xs text-gray-500 mt-2">{result.remarks}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Subject</th>
                      <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Score</th>
                      <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Grade</th>
                      <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {report.results.map((result) => (
                      <tr key={result.id} className="hover:bg-gray-50">
                        <td className="px-4 sm:px-6 py-4 text-sm font-medium text-gray-900">{result.subjectName}</td>
                        <td className="px-4 sm:px-6 py-4 text-sm text-gray-600 text-right">{Number(result.totalScore).toFixed(1)}</td>
                        <td className="px-4 sm:px-6 py-4 text-sm text-gray-600 text-center">
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs font-semibold">
                            {result.grade}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-sm text-gray-600">{result.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-gray-500">
              No results found for this term.
            </div>
          )}

          {/* Remarks Section */}
          <div className="p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
            <h4 className="text-base sm:text-lg font-semibold text-gray-800 mb-4">Remarks</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Class Teacher's Remarks</label>
                <textarea
                  value={teacherRemark}
                  onChange={(e) => setTeacherRemark(e.target.value)}
                  className="print:hidden w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none h-28 sm:h-32 resize-none text-base"
                  placeholder="Enter remarks..."
                />
                <div className="hidden print:block p-3 border border-gray-200 rounded-lg min-h-[8rem] whitespace-pre-wrap">
                  {teacherRemark}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Principal's Remarks</label>
                <textarea
                  value={principalRemark}
                  onChange={(e) => setPrincipalRemark(e.target.value)}
                  className="print:hidden w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none h-28 sm:h-32 resize-none text-base"
                  placeholder="Enter remarks..."
                />
                <div className="hidden print:block p-3 border border-gray-200 rounded-lg min-h-[8rem] whitespace-pre-wrap">
                  {principalRemark}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSaveRemarks}
                disabled={savingRemarks}
                className="print:hidden w-full sm:w-auto px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300 active:scale-98"
              >
                {savingRemarks ? 'Saving...' : 'Save Remarks'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportCards;
