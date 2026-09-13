import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { FileText, AlertCircle, CheckCircle, Printer, Download, FileSpreadsheet, Mail, Brain, Loader2, X } from 'lucide-react';
import { exportToCSV, exportToExcel } from '../../utils/exportUtils';
import { reportCardService, StudentReport } from '../../services/reportCardService';
import api from '../../utils/api';
import StudentReportCard from '../../components/academics/StudentReportCard';
import ClassBroadsheet from '../../components/academics/ClassBroadsheet';
import aiIntelligenceService, { ParentLetterResponse } from '../../services/aiIntelligenceService';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/DesignSystem';


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
  const [parentLetter, setParentLetter] = useState<ParentLetterResponse | null>(null);
  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [showLetterModal, setShowLetterModal] = useState(false);
  const reportRef = React.useRef<HTMLDivElement>(null);
  const exportButtonRef = React.useRef<HTMLButtonElement>(null);

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



  const handleGenerateParentLetter = async () => {
    if (!selectedStudent || !selectedTerm) return;
    setGeneratingLetter(true);
    try {
      const letter = await aiIntelligenceService.generateParentLetter(selectedStudent, selectedTerm);
      setParentLetter(letter);
      setShowLetterModal(true);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to generate parent letter');
    } finally {
      setGeneratingLetter(false);
    }
  };

  const handleViewBroadsheet = async () => {    if (!selectedClass || !selectedTerm) return;
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
      <div className="ds-page h-[calc(100vh-64px)]">
        <ClassBroadsheet
          reports={classReports}
          onClose={() => setShowBroadsheet(false)}
        />
      </div>
    );
  }

  return (
    <div className="ds-page">
      <PageHeader title="Report Cards" description="Generate student reports, review class results and export reports for the selected term." />

      <div className="ds-card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="ds-field">
            <label htmlFor="report-term" className="ds-label">Academic Term</label>
            <select
              id="report-term"
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="ds-select"
            >
              <option value="">Select Term</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name} ({new Date(term.startDate).getFullYear()})
                </option>
              ))}
            </select>
          </div>

          <div className="ds-field">
            <label htmlFor="report-class" className="ds-label">Class</label>
            <select
              id="report-class"
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setSelectedStudent('');
              }}
              className="ds-select"
            >
              <option value="">Select Class</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>

          <div className="ds-field">
            <label htmlFor="report-student" className="ds-label">Student</label>
            <select
              id="report-student"
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              disabled={!selectedClass}
              className="ds-select"
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

        <div className="ds-actions mt-6">
          <button
            onClick={handleGenerateReport}
            disabled={!selectedStudent || !selectedTerm || generating}
            className="ds-button-primary"
            aria-busy={generating || undefined}
          >
            <FileText size={20} />
            {generating && selectedStudent ? 'Generating...' : 'Generate Student Report'}
          </button>
          <div className="relative" onKeyDown={event => {
            if (event.key === 'Escape' && showExportMenu) {
              setShowExportMenu(false);
              exportButtonRef.current?.focus();
            }
          }}>
            <button
              ref={exportButtonRef}
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={!selectedClass || !selectedTerm || generating}
              className="ds-button-secondary"
              aria-expanded={showExportMenu}
              aria-controls="report-export-actions"
            >
              <Download size={20} />
              Export / Print
            </button>

            {showExportMenu && (
              <div id="report-export-actions" className="ds-surface absolute left-0 mt-2 w-56 z-50 overflow-hidden">
                <button
                  onClick={() => handleExport('PRINT')}
                  className="ds-button-ghost w-full justify-start text-left"
                >
                  <Printer size={16} className="text-blue-600" />
                  Print Reports (PDF)
                </button>
                <button
                  onClick={() => handleExport('EXCEL')}
                  className="ds-button-ghost w-full justify-start text-left"
                >
                  <FileSpreadsheet size={16} className="text-green-600" />
                  Export Excel (Results)
                </button>
                <button
                  onClick={() => handleExport('CSV')}
                  className="ds-button-ghost w-full justify-start text-left"
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
            className="ds-button-outline"
          >
            <FileSpreadsheet size={20} />
            Broadsheet
          </button>
          <button
            onClick={handleGenerateParentLetter}
            disabled={!selectedStudent || !selectedTerm || generatingLetter}
            title="Generate an AI-written personalised letter to the student's guardian"
            className="ds-button-outline"
            aria-busy={generatingLetter || undefined}
          >
            {generatingLetter ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
            {generatingLetter ? 'Writing…' : 'AI Parent Letter'}
          </button>
        </div>

        {error && (
          <div className="ds-alert ds-badge-error mt-4" role="alert">
            <AlertCircle size={20} className="shrink-0" aria-hidden="true" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ds-button-ghost ml-auto shrink-0" aria-label="Dismiss report error"><X size={18} aria-hidden="true" /></button>
          </div>
        )}
        {success && (
          <div className="ds-alert ds-badge-success mt-4" role="status">
            <CheckCircle size={20} className="shrink-0" aria-hidden="true" />
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="ds-button-ghost ml-auto shrink-0" aria-label="Dismiss report confirmation"><X size={18} aria-hidden="true" /></button>
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

      {/* AI Parent Letter Modal */}
      {showLetterModal && parentLetter && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="ds-surface max-w-2xl w-full max-h-[90vh] flex flex-col" role="dialog" aria-labelledby="parent-letter-title" aria-describedby="parent-letter-description">
            <div className="flex flex-wrap items-center justify-between gap-4 p-6 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[var(--surface-muted)] rounded-xl">
                  <Brain className="w-5 h-5 text-[var(--text-secondary)]" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="parent-letter-title">AI Parent Letter</h3>
                  <p id="parent-letter-description" className="ds-helper">
                    {parentLetter.studentName} · {parentLetter.termName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const win = window.open('', '_blank');
                    if (win) {
                      win.document.write(`<html><head><title>Parent Letter — ${parentLetter.studentName}</title><style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;line-height:1.7;font-size:16px;}</style></head><body>${parentLetter.letterHtml}</body></html>`);
                      win.document.close();
                      win.print();
                    }
                  }}
                  className="ds-button-secondary"
                >
                  <Printer size={15} /> Print
                </button>
                <button
                  onClick={() => setShowLetterModal(false)}
                  className="ds-button-ghost"
                  aria-label="Close parent letter"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-8">
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parentLetter.letterHtml || `<p style="white-space:pre-wrap">${parentLetter.letterPlainText}</p>`) }}
              />
            </div>
            <div className="p-4 border-t border-[var(--border-color)] ds-helper text-center">
              Generated by AI · Review before sending · Generated {new Date(parentLetter.generatedAt).toLocaleString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportCards;
