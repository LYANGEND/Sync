import React, { useState, useEffect } from 'react';
import { FileText, Users, AlertCircle, CheckCircle, Printer } from 'lucide-react';
import { reportCardService, StudentReport } from '../../services/reportCardService';
import api from '../../utils/api';
import StudentReportCard from '../../components/academics/StudentReportCard';

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
  const [classReports, setClassReports] = useState<StudentReport[]>([]);
  const [printingAll, setPrintingAll] = useState(false);
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

  const handleBulkPrint = async () => {
    if (!selectedClass || !selectedTerm) return;

    try {
      setGenerating(true);
      setError(null);
      const reports = await reportCardService.getClassReports(selectedClass, selectedTerm);
      if (reports.length === 0) {
        setError('No reports found for this class');
        return;
      }
      setClassReports(reports);
      setPrintingAll(true);
      // Wait for render then print
      setTimeout(() => {
        window.print();
        // Optional: Reset after print dialog closes (though we can't detect close easily)
        // setPrintingAll(false); 
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch class reports for printing');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Report Cards</h2>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Academic Term</label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">Select Class</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
            <select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              disabled={!selectedClass}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
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
          <button
            onClick={handleGenerateClassReports}
            disabled={!selectedClass || !selectedTerm || generating}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            <Users size={20} />
            {generating && !selectedStudent ? 'Generating...' : 'Generate Class Reports'}
          </button>
          <button
            onClick={handleBulkPrint}
            disabled={!selectedClass || !selectedTerm || generating}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            <Printer size={20} />
            {printingAll ? 'Preparing Print...' : 'Print All Reports'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-center gap-2">
            <AlertCircle size={20} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto"><div className="sr-only">Close</div></button>
          </div>
        )}
        {success && (
          <div className="mt-4 p-4 bg-green-50 text-green-700 rounded-lg border border-green-200 flex items-center gap-2">
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
          {classReports.map((r, i) => (
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
