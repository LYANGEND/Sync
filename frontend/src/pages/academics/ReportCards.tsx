import React, { useState, useEffect } from 'react';
import { FileText, AlertCircle, CheckCircle, Printer, Download, FileSpreadsheet } from 'lucide-react';
import { exportToCSV, exportToExcel } from '../../utils/exportUtils';
import { reportCardService, StudentReport } from '../../services/reportCardService';
import api from '../../utils/api';
import StudentReportCard from '../../components/academics/StudentReportCard';
import ClassBroadsheet from '../../components/academics/ClassBroadsheet';


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
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [classReports, setClassReports] = useState<StudentReport[]>([]);
  const [printingAll, setPrintingAll] = useState(false);
  const [showBroadsheet, setShowBroadsheet] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
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
    setShowBroadsheet(false);
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





  const handleExport = async (type: 'PRINT' | 'EXCEL' | 'CSV') => {
    if (!selectedClass || !selectedTerm) return;

    try {
      setGenerating(true);
      setError(null);

      // Auto-generate reports to ensure data is fresh
      await reportCardService.generateClassReports(selectedClass, selectedTerm);

      // Ensure we have ALL reports
      const reports = await reportCardService.getClassReports(selectedClass, selectedTerm);
      if (reports.length === 0) {
        setError('No students found in this class.');
        return;
      }
      setClassReports(reports);

      const className = classes.find(c => c.id === selectedClass)?.name || 'Class';
      const termName = terms.find(t => t.id === selectedTerm)?.name || 'Term';

      if (type === 'PRINT') {
        setPrintingAll(true);
        setTimeout(() => {
          window.print();
        }, 1000);
      } else if (type === 'EXCEL') {
        exportToExcel(reports, className, termName);
        setSuccess('Excel exported successfully');
      } else if (type === 'CSV') {
        exportToCSV(reports, className, termName);
        setSuccess('CSV exported successfully');
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to export reports');
    } finally {
      setGenerating(false);
      setShowExportMenu(false);
    }
  };



  const handleViewBroadsheet = async () => {
    if (!selectedClass || !selectedTerm) return;
    try {
      setGenerating(true);
      // Auto-generate reports
      await reportCardService.generateClassReports(selectedClass, selectedTerm);

      const reports = await reportCardService.getClassReports(selectedClass, selectedTerm);
      if (reports.length === 0) {
        setError('No students found in this class.');
        return;
      }
      setClassReports(reports);
      setShowBroadsheet(true);
      setReport(null); // Clear single report
    } catch (err: any) {
      setError('Failed to load broadsheet');
    } finally {
      setGenerating(false);
    }
  };

  if (showBroadsheet) {
    return (
      <div className="p-6 h-[calc(100vh-64px)]">
        <ClassBroadsheet
          reports={classReports}
          onClose={() => setShowBroadsheet(false)}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Report Cards</h2>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Academic Term</label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white"
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Class</label>
            <select
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setSelectedStudent('');
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white"
            >
              <option value="">Select Class</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Student</label>
            <select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              disabled={!selectedClass}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 dark:disabled:bg-slate-700 disabled:text-gray-400 dark:disabled:text-gray-500 bg-white dark:bg-slate-700 dark:text-white"
            >
              <option value="">None (Select for individual report)</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.firstName} {student.lastName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleGenerateReport}
            disabled={!selectedStudent || !selectedTerm || generating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            <FileText size={20} />
            {generating && selectedStudent ? 'Generating...' : 'Generate Student Report'}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={!selectedClass || !selectedTerm || generating}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              <Download size={20} />
              Export / Print
            </button>

            {showExportMenu && (
              <div className="absolute left-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 z-50 overflow-hidden">
                <button
                  onClick={() => handleExport('PRINT')}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 text-gray-700 dark:text-gray-300 border-b border-gray-50 dark:border-slate-700"
                >
                  <Printer size={16} className="text-blue-600" />
                  Print Reports (PDF)
                </button>
                <button
                  onClick={() => handleExport('EXCEL')}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 text-gray-700 dark:text-gray-300 border-b border-gray-50 dark:border-slate-700"
                >
                  <FileSpreadsheet size={16} className="text-green-600" />
                  Export Excel (Results)
                </button>
                <button
                  onClick={() => handleExport('CSV')}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                >
                  <FileText size={16} className="text-gray-500" />
                  Export CSV
                </button>
              </div>
            )}
          </div>
          <button
            onClick={handleViewBroadsheet}
            disabled={!selectedClass || !selectedTerm || generating}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:bg-emerald-300 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet size={20} />
            Broadsheet
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800 flex items-center gap-2">
            <AlertCircle size={20} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto"><div className="sr-only">Close</div></button>
          </div>
        )}
        {success && (
          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-2">
            <CheckCircle size={20} />
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-auto"><div className="sr-only">Close</div></button>
          </div>
        )}
      </div>

      {report && !printingAll && (
        <div id="printable-report" ref={reportRef}>
          <StudentReportCard
            report={report}
            editable={true}
            teacherRemark={teacherRemark}
            principalRemark={principalRemark}
            onTeacherRemarkChange={setTeacherRemark}
            onPrincipalRemarkChange={setPrincipalRemark}
            onSaveRemarks={handleSaveRemarks}
            saving={savingRemarks}
          />
        </div>
      )}

      {printingAll && classReports.length > 0 && (
        <div className="print-only">
          {classReports.map((r) => (
            <div key={r.id} style={{ pageBreakAfter: 'always' }} className="pb-8">
              <StudentReportCard report={r} editable={false} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReportCards;
