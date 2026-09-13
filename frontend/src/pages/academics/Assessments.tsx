import React, { useState, useEffect } from 'react';
import { Plus, FileText, Calendar, BookOpen, Users, ChevronRight, ArrowLeft, Save, Edit3, Trash2, Sparkles, Loader2 } from 'lucide-react';
import api from '../../utils/api';
import QuestionBuilder from '../../components/academics/QuestionBuilder';
import SubjectGradebook from '../../components/academics/SubjectGradebook';
import { BarChart2, TrendingUp, Award, Calculator, Download, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { PageHeader } from '../../components/ui/DesignSystem';

interface Assessment {
  id: string;
  title: string;
  type: 'EXAM' | 'TEST' | 'QUIZ' | 'HOMEWORK' | 'PROJECT';
  date: string;
  totalMarks: number;
  weight: number;
  class: { id: string; name: string };
  subject: { id: string; name: string };
  _count?: { results: number };
  isOnline?: boolean;
}

interface ClassOption {
  id: string;
  name: string;
  gradeLevel?: number;
  subjects?: Array<{ id: string; name: string; code?: string }>;
}

interface SubjectOption {
  id: string;
  name: string;
  code?: string;
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
}

interface AssessmentResult {
  studentId: string;
  score: number;
  remarks: string;
}

interface AssessmentsProps {
  subjectId?: string;
}

const Assessments: React.FC<AssessmentsProps> = ({ subjectId: propSubjectId }) => {
  const { confirm } = useAppDialog();
  const [view, setView] = useState<'list' | 'create' | 'grade' | 'questions' | 'gradebook'>('list');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [terms, setTerms] = useState<any[]>([]);

  // Filters
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');

  // Selected Assessment for Grading
  const [currentAssessment, setCurrentAssessment] = useState<Assessment | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Record<string, { score: string; remarks: string }>>({});
  const [savingGrades, setSavingGrades] = useState(false);
  const [selectedAssessments, setSelectedAssessments] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);

  // New Assessment Form
  const [newAssessment, setNewAssessment] = useState({
    title: '',
    type: 'QUIZ',
    date: new Date().toISOString().split('T')[0],
    totalMarks: 100,
    weight: 10,
    classId: '',
    subjectId: '',
    termId: '',
    description: ''
  });

  const selectedClassOption = classes.find(c => c.id === selectedClass);
  const selectedCreateClassOption = classes.find(c => c.id === newAssessment.classId);
  const filteredListSubjects = selectedClass
    ? (selectedClassOption?.subjects?.length ? selectedClassOption.subjects : subjects)
    : subjects;
  const filteredCreateSubjects = newAssessment.classId
    ? (selectedCreateClassOption?.subjects?.length ? selectedCreateClassOption.subjects : subjects)
    : subjects;

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchAssessments();
  }, [selectedClass, selectedSubject]);

  useEffect(() => {
    if (!selectedClass) return;
    if (filteredListSubjects.length === 0) {
      setSelectedSubject('');
      return;
    }
    if (selectedSubject && filteredListSubjects.some(subject => subject.id === selectedSubject)) {
      return;
    }
    setSelectedSubject(filteredListSubjects[0].id);
  }, [selectedClass, selectedSubject, filteredListSubjects]);

  useEffect(() => {
    if (!newAssessment.classId) return;
    if (filteredCreateSubjects.length === 0) {
      setNewAssessment(prev => ({ ...prev, subjectId: '' }));
      return;
    }
    if (newAssessment.subjectId && filteredCreateSubjects.some(subject => subject.id === newAssessment.subjectId)) {
      return;
    }
    setNewAssessment(prev => ({ ...prev, subjectId: filteredCreateSubjects[0].id }));
  }, [newAssessment.classId, newAssessment.subjectId, filteredCreateSubjects]);

  useEffect(() => {
    if (propSubjectId) {
      setSelectedSubject(propSubjectId);
      setNewAssessment(prev => ({ ...prev, subjectId: propSubjectId }));
    }
  }, [propSubjectId]);

  const fetchInitialData = async () => {
    try {
      const [classesRes, subjectsRes, termsRes] = await Promise.all([
        api.get('/classes'),
        api.get('/subjects'),
        api.get('/academic-terms') // Assuming this endpoint exists or similar
      ]);
      setClasses(classesRes.data);
      setSubjects(subjectsRes.data);
      setTerms(termsRes.data);

      if (classesRes.data.length > 0) {
        const firstClass = classesRes.data[0];
        const firstClassSubjects = firstClass.subjects || [];
        setSelectedClass(firstClass.id);
        if (!propSubjectId) {
          setSelectedSubject(firstClassSubjects[0]?.id || '');
        }
        setNewAssessment(prev => ({
          ...prev,
          classId: prev.classId || firstClass.id,
          subjectId: prev.subjectId || firstClassSubjects[0]?.id || prev.subjectId,
        }));
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  };

  const fetchAssessments = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedClass) params.classId = selectedClass;
      if (selectedSubject) params.subjectId = selectedSubject;

      const response = await api.get('/assessments', { params });
      setAssessments(response.data);
    } catch (error) {
      console.error('Error fetching assessments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAIGenerateAssessment = async () => {
    if (!selectedClass && !newAssessment.classId) {
      alert('Please select a class first.');
      return;
    }
    if (!selectedSubject && !newAssessment.subjectId) {
      alert('Please select a subject first.');
      return;
    }
    setGeneratingAI(true);
    try {
      const classId = newAssessment.classId || selectedClass;
      const subjectId = newAssessment.subjectId || selectedSubject || propSubjectId;
      const activeTerm = terms.find((t: any) => t.isActive);
      const termId = newAssessment.termId || activeTerm?.id;
      
      const res = await api.post('/master-ai/chat', {
        message: `Generate a ${newAssessment.type || 'QUIZ'} assessment with questions for the class and subject I selected. Include 10 varied questions.`,
        context: { classId, subjectId, termId, assessmentType: newAssessment.type || 'QUIZ' }
      });
      
      // Refresh the list to show the AI-created assessment
      fetchAssessments();
      setView('list');
      alert('AI assessment generated! Check your assessments list.');
    } catch (error: any) {
      console.error('AI assessment generation failed:', error);
      alert(error?.response?.data?.error || 'AI generation failed. Try again.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/assessments', {
        ...newAssessment,
        totalMarks: Number(newAssessment.totalMarks),
        weight: Number(newAssessment.weight),
        date: new Date(newAssessment.date).toISOString()
      });
      setView('list');
      fetchAssessments();
      // Reset form
      setNewAssessment({
        title: '',
        type: 'QUIZ',
        date: new Date().toISOString().split('T')[0],
        totalMarks: 100,
        weight: 10,
        classId: '',
        subjectId: '',
        termId: '',
        description: ''
      });
    } catch (error) {
      console.error('Error creating assessment:', error);
      alert('Failed to create assessment');
    }
  };

  const downloadTemplate = () => {
    if (!currentAssessment) return;
    const wsData = [
      ['Admission No', 'Student Name', 'Score', 'Remarks'],
      ...students.map(s => [s.admissionNumber, `${s.firstName} ${s.lastName}`, '', ''])
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Grades");
    XLSX.writeFile(wb, `${currentAssessment.title}_Template.xlsx`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const newGrades = { ...grades };
      let updated = 0;

      // Skip header row
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const admNo = row[0]?.toString();
        const score = row[2];
        const remarks = row[3];

        if (admNo) {
          const student = students.find(s => s.admissionNumber === admNo);
          if (student) {
            newGrades[student.id] = {
              score: score !== undefined ? String(score) : '',
              remarks: remarks || ''
            };
            updated++;
          }
        }
      }
      setGrades(newGrades);
      alert(`Imported grades for ${updated} students.`);
    };
    reader.readAsBinaryString(file);
  };

  const openGradebook = async (assessment: Assessment) => {
    setCurrentAssessment(assessment);
    setView('grade');
    setLoading(true);
    try {
      // Fetch students in the class
      const studentsRes = await api.get(`/classes/${assessment.class.id}/students`);
      setStudents(studentsRes.data);

      // Fetch existing results
      const resultsRes = await api.get(`/assessments/${assessment.id}/results`);
      const existingGrades: Record<string, { score: string; remarks: string }> = {};

      resultsRes.data.forEach((r: any) => {
        existingGrades[r.studentId] = {
          score: String(r.score),
          remarks: r.remarks || ''
        };
      });
      setGrades(existingGrades);
    } catch (error) {
      console.error('Error loading gradebook:', error);
    } finally {
      setLoading(false);
    }
  };

  const openQuestionBuilder = (assessment: Assessment) => {
    setCurrentAssessment(assessment);
    setView('questions');
  };

  const handleGradeChange = (studentId: string, field: 'score' | 'remarks', value: string) => {
    setGrades(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value
      }
    }));
  };

  const saveGrades = async () => {
    if (!currentAssessment) return;
    setSavingGrades(true);
    try {
      const results = Object.entries(grades).map(([studentId, data]) => ({
        studentId,
        score: Number(data.score) || 0,
        remarks: data.remarks
      })).filter(r => grades[r.studentId]?.score !== undefined && grades[r.studentId]?.score !== '');

      await api.post('/assessments/results', {
        assessmentId: currentAssessment.id,
        results
      });
      alert('Grades saved successfully');
    } catch (error) {
      console.error('Error saving grades:', error);
      alert('Failed to save grades');
    } finally {
      setSavingGrades(false);
    }
  };

  if (view === 'questions' && currentAssessment) {
    return (
      <div className="ds-page">
        <button
          onClick={() => setView('list')}
          className="ds-button-ghost"
        >
          <ArrowLeft size={20} aria-hidden="true" />
          Back to Assessments
        </button>

        <PageHeader title={currentAssessment.title} description="Manage Questions" />

        <QuestionBuilder
          assessmentId={currentAssessment.id}
          subjectId={currentAssessment.subject?.id}
          subjectName={currentAssessment.subject?.name}
          onClose={() => setView('list')}

        />
      </div>
    );
  }

  if (view === 'gradebook') {
    // These variables are not used here, they seem to be part of a different context.
    // const wsData: any[][] = [
    //    [`Subject Gradebook: ${subjectNameStr} - ${classNameStr}`],
    //    headers
    // ];
    return (
      <SubjectGradebook
        classId={selectedClass}
        subjectId={selectedSubject}
        termId={''}
        onBack={() => setView('list')}
        classNameStr={classes.find(c => c.id === selectedClass)?.name || 'Class'}
        subjectNameStr={subjects.find(s => s.id === selectedSubject)?.name || 'Subject'}
      />
    );
  }

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedAssessments);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedAssessments(newSelected);
  };

  const handleBulkDelete = async () => {
    if (!(await confirm({
      title: 'Delete assessments?',
      message: `Are you sure you want to delete ${selectedAssessments.size} assessments?`,
      confirmText: 'Delete assessments',
    }))) return;

    setDeleting(true);
    try {
      await api.post('/assessments/bulk-delete', {
        ids: Array.from(selectedAssessments)
      });
      setSelectedAssessments(new Set());
      fetchAssessments();
    } catch (error) {
      console.error('Failed to delete assessments', error);
      alert('Failed to delete assessments');
    } finally {
      setDeleting(false);
    }
  };

  if (view === 'create') {
    return (
      <div className="ds-page">
        <button
          onClick={() => setView('list')}
          className="ds-button-ghost"
        >
          <ArrowLeft size={20} aria-hidden="true" />
          Back to Assessments
        </button>

        <PageHeader title="Create New Assessment" description="Set the assessment details, class, subject and academic term." />
        <div className="ds-card max-w-2xl">

          <form onSubmit={handleCreateAssessment} className="space-y-4">
            <div>
              <label htmlFor="assessment-title" className="ds-label mb-2">Title (required)</label>
              <input
                id="assessment-title"
                type="text"
                required
                value={newAssessment.title}
                onChange={e => setNewAssessment({ ...newAssessment, title: e.target.value })}
                className="ds-input"
                placeholder="e.g., Mid-Term Mathematics Exam"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="assessment-type" className="ds-label mb-2">Type</label>
                <select
                  id="assessment-type"
                  value={newAssessment.type}
                  onChange={e => setNewAssessment({ ...newAssessment, type: e.target.value })}
                  className="ds-select"
                >
                  <option value="QUIZ">Quiz</option>
                  <option value="TEST">Test</option>
                  <option value="EXAM">Exam</option>
                  <option value="HOMEWORK">Homework</option>
                  <option value="PROJECT">Project</option>
                </select>
              </div>
              <div>
                <label htmlFor="assessment-date" className="ds-label mb-2">Date (required)</label>
                <input
                  id="assessment-date"
                  type="date"
                  required
                  value={newAssessment.date}
                  onChange={e => setNewAssessment({ ...newAssessment, date: e.target.value })}
                  className="ds-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="assessment-class" className="ds-label mb-2">Class (required)</label>
                <select
                  id="assessment-class"
                  required
                  value={newAssessment.classId}
                  onChange={e => setNewAssessment({ ...newAssessment, classId: e.target.value })}
                  className="ds-select"
                >
                  <option value="">Select Class</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="assessment-subject" className="ds-label mb-2">Subject (required)</label>
                <select
                  id="assessment-subject"
                  required
                  value={newAssessment.subjectId}
                  onChange={e => setNewAssessment({ ...newAssessment, subjectId: e.target.value })}
                  className="ds-select"
                >
                  <option value="">Select Subject</option>
                  {filteredCreateSubjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="assessment-term" className="ds-label mb-2">Academic Term (required)</label>
              <select
                id="assessment-term"
                required
                value={newAssessment.termId}
                onChange={e => setNewAssessment({ ...newAssessment, termId: e.target.value })}
                className="ds-select"
              >
                <option value="">Select Term</option>
                {terms.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="assessment-marks" className="ds-label mb-2">Total Marks (required)</label>
                <input
                  id="assessment-marks"
                  type="number"
                  required
                  min="1"
                  value={newAssessment.totalMarks}
                  onChange={e => setNewAssessment({ ...newAssessment, totalMarks: Number(e.target.value) })}
                  className="ds-input"
                />
              </div>
              <div>
                <label htmlFor="assessment-weight" className="ds-label mb-2">Weight (%) (required)</label>
                <input
                  id="assessment-weight"
                  type="number"
                  required
                  min="0"
                  max="100"
                  value={newAssessment.weight}
                  onChange={e => setNewAssessment({ ...newAssessment, weight: Number(e.target.value) })}
                  className="ds-input"
                />
              </div>
            </div>

            <div>
              <label htmlFor="assessment-description" className="ds-label mb-2">Description (optional)</label>
              <textarea
                id="assessment-description"
                value={newAssessment.description}
                onChange={e => setNewAssessment({ ...newAssessment, description: e.target.value })}
                className="ds-textarea"
                rows={3}
              />
            </div>

            <div className="ds-form-actions">
              <button
                type="submit"
                className="ds-button-primary w-full sm:w-auto"
              >
                Create Assessment
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'grade' && currentAssessment) {
    return (
      <div className="ds-page">
        <PageHeader title={currentAssessment.title} description="Review student scores and remarks." />
        <div className="ds-toolbar justify-between">
          <div className="ds-actions">
            <button
              onClick={() => setView('list')}
              className="ds-button-ghost"
            >
              <ArrowLeft size={20} aria-hidden="true" />
              Back to Assessments
            </button>
            <button onClick={downloadTemplate} className="ds-button-outline">
              <Download size={16} aria-hidden="true" /> Template
            </button>
            <label className="ds-button-outline relative cursor-pointer focus-within:ring-2 focus-within:ring-[var(--action-color)]">
              <Upload size={16} aria-hidden="true" /> Import
              <input type="file" accept=".xlsx, .xls" aria-label="Import grades from an Excel workbook" className="absolute inset-0 w-full cursor-pointer opacity-0" onChange={handleFileUpload} />
            </label>
          </div>

          <button
            onClick={saveGrades}
            disabled={savingGrades}
            aria-busy={savingGrades}
            className="ds-button-primary"
          >
            <Save size={20} aria-hidden="true" />
            {savingGrades ? 'Saving...' : 'Save Grades'}
          </button>
        </div>

        <div className="ds-surface overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-[var(--border-color)] bg-[var(--surface-muted)]">
            <div className="flex flex-wrap gap-4 justify-between items-start mb-6">
              <div>
                <h2>Assessment summary</h2>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-[var(--text-secondary)]">
                  <span className="flex items-center"><BookOpen size={16} className="mr-1" aria-hidden="true" /> {currentAssessment.subject.name}</span>
                  <span className="flex items-center"><Users size={16} className="mr-1" aria-hidden="true" /> {currentAssessment.class.name}</span>
                  <span className="flex items-center"><Calendar size={16} className="mr-1" aria-hidden="true" /> {new Date(currentAssessment.date).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="ds-helper">Total Marks</div>
                <div className="text-2xl font-bold">{currentAssessment.totalMarks}</div>
              </div>
            </div>

            {/* Analytics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
              <div className="ds-card">
                <div className="ds-helper mb-1 flex items-center gap-1">
                  <BarChart2 size={16} aria-hidden="true" /> Average Score
                </div>
                <div className="text-xl font-bold">
                  {(Object.values(grades).reduce((acc, g) => acc + (Number(g.score) || 0), 0) / (Object.keys(grades).length || 1)).toFixed(1)}
                  <span className="text-xs text-[var(--text-secondary)] font-normal ml-1">/ {currentAssessment.totalMarks}</span>
                </div>
              </div>
              <div className="ds-card">
                <div className="ds-helper mb-1 flex items-center gap-1">
                  <TrendingUp size={16} aria-hidden="true" /> Pass Rate
                </div>
                <div className="text-xl font-bold">
                  {(Object.values(grades).filter(g => (Number(g.score) || 0) >= (currentAssessment.totalMarks * 0.5)).length / (Object.keys(grades).length || 1) * 100).toFixed(1)}%
                </div>
              </div>
              <div className="ds-card">
                <div className="ds-helper mb-1 flex items-center gap-1">
                  <Award size={16} aria-hidden="true" /> Highest Score
                </div>
                <div className="text-xl font-bold">
                  {Math.max(...Object.values(grades).map(g => Number(g.score) || 0))}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto" role="region" aria-label={`Grades for ${currentAssessment.title}`} tabIndex={0} aria-busy={loading}>
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Admission No.</th>
                  <th scope="col" className="w-32">Score</th>
                  <th scope="col">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {students.map(student => (
                  <tr key={student.id}>
                    <td className="font-medium">
                      {student.firstName} {student.lastName}
                    </td>
                    <td className="text-[var(--text-secondary)] font-mono">
                      {student.admissionNumber}
                    </td>
                    <td>
                      <input
                        aria-label={`Score for ${student.firstName} ${student.lastName} (${student.admissionNumber}), out of ${currentAssessment.totalMarks}`}
                        type="number"
                        min="0"
                        max={currentAssessment.totalMarks}
                        value={grades[student.id]?.score || ''}
                        onChange={e => handleGradeChange(student.id, 'score', e.target.value)}
                        className="ds-input min-w-[100px]"
                        placeholder="-"
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Remarks for ${student.firstName} ${student.lastName} (${student.admissionNumber})`}
                        type="text"
                        value={grades[student.id]?.remarks || ''}
                        onChange={e => handleGradeChange(student.id, 'remarks', e.target.value)}
                        className="ds-input min-w-[220px]"
                        placeholder="Optional remarks"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-page">
      <PageHeader title="Assessments" description="Manage exams, tests, and homework assignments." />

      <div className="ds-card ds-toolbar justify-between">
        <div className="flex flex-wrap gap-4 w-full">
          <div className="ds-field flex-1 min-w-0 sm:min-w-[200px]">
            <label htmlFor="assessment-filter-class" className="ds-label">Class</label>
            <select
              id="assessment-filter-class"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="ds-select"
            >
              <option value="">All Classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {!propSubjectId && (
          <div className="ds-field flex-1 min-w-0 sm:min-w-[200px]">
            <label htmlFor="assessment-filter-subject" className="ds-label">Subject</label>
            <select
              id="assessment-filter-subject"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="ds-select"
            >
              <option value="">All Subjects</option>
              {filteredListSubjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          )}
        </div>

        <div className="ds-actions w-full">
          {selectedClass && selectedSubject && (
            <button
              onClick={() => setView('gradebook')}
              className="ds-button-outline"
              aria-label="View full subject gradebook"
              title="View full subject matrix"
            >
              <Calculator size={18} aria-hidden="true" />
              <span className="hidden sm:inline">Gradebook</span>
            </button>
          )}
          {selectedAssessments.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              className="ds-button-destructive"
              aria-label={`Delete ${selectedAssessments.size} selected assessments`}
              aria-busy={deleting}
            >
              <Trash2 size={18} aria-hidden="true" />
              <span className="hidden sm:inline">Delete ({selectedAssessments.size})</span>
            </button>
          )}
          <button
            onClick={() => setView('create')}
            className="ds-button-primary"
          >
            <Plus size={18} aria-hidden="true" />
            <span className="hidden sm:inline">New Assessment</span>
            <span className="sm:hidden">Create</span>
          </button>
          {(selectedClass || selectedSubject || propSubjectId) && (
            <button
              onClick={handleAIGenerateAssessment}
              disabled={generatingAI}
              className="ds-button-secondary"
              aria-label={generatingAI ? 'Generating assessment with AI' : 'AI Generate assessment'}
              aria-busy={generatingAI}
            >
              {generatingAI ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
              <span className="hidden sm:inline">{generatingAI ? 'Generating...' : 'AI Generate'}</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div role="status" className="ds-empty flex flex-col items-center justify-center">
          <Loader2 className="animate-spin mb-4" size={32} aria-hidden="true" />
          <p>Loading assessments...</p>
        </div>
      ) : assessments.length === 0 ? (
        <div className="ds-surface ds-empty">
          <div className="bg-[var(--surface-muted)] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText size={32} aria-hidden="true" />
          </div>
          <h3>No assessments found</h3>
          <p className="ds-helper mt-2 max-w-sm mx-auto">
            {selectedClass || selectedSubject
              ? "Try adjusting your filters to find what you're looking for."
              : "Create your first assessment to start tracking student performance."}
          </p>
          {!selectedClass && !selectedSubject && (
            <button
              onClick={() => setView('create')}
              className="ds-button-primary mt-6"
            >
              Create New Assessment
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {assessments.map(assessment => {
            const typeBadge = assessment.type === 'EXAM' ? 'ds-badge-error' :
              assessment.type === 'TEST' ? 'ds-badge-warning' :
                assessment.type === 'QUIZ' ? 'ds-badge-info' : 'ds-badge-success';

            return (
              <div
                key={assessment.id}
                className="ds-surface flex flex-col overflow-hidden"
              >
                <div className="p-4 sm:p-6 flex-1">
                  <div className="flex flex-wrap gap-2 justify-between items-start mb-3">
                    <span className={`ds-badge ${typeBadge}`}>
                      {assessment.type}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="ds-badge ds-badge-neutral">
                        <Calendar size={12} aria-hidden="true" />
                        {new Date(assessment.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      <label className="inline-flex min-h-11 items-center gap-2 cursor-pointer text-sm text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={selectedAssessments.has(assessment.id)}
                          onChange={() => toggleSelection(assessment.id)}
                          className="ds-choice"
                        />
                        <span>Select<span className="sr-only"> {assessment.title} ({assessment.class.name}, {assessment.subject.name})</span></span>
                      </label>
                    </div>
                  </div>

                  <h3 className="mb-1 break-words">
                    {assessment.title}
                  </h3>

                  <div className="flex flex-col gap-1.5 mt-4">
                    <div className="flex items-center text-sm text-[var(--text-secondary)]">
                      <BookOpen size={16} className="mr-2 shrink-0" aria-hidden="true" />
                      <span className="truncate font-medium">{assessment.subject.name}</span>
                    </div>
                    <div className="flex items-center text-sm text-[var(--text-secondary)]">
                      <Users size={16} className="mr-2 shrink-0" aria-hidden="true" />
                      <span className="truncate">{assessment.class.name}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:px-6 bg-[var(--surface-muted)] border-t border-[var(--border-color)] flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xl font-bold leading-none">
                      {assessment._count?.results || 0}
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-secondary)] mt-1">Graded</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {(assessment.type === 'QUIZ' || assessment.type === 'TEST' || assessment.type === 'EXAM') && (
                      <button
                        onClick={() => openQuestionBuilder(assessment)}
                        className="ds-button-ghost"
                        aria-label={`Manage questions for ${assessment.title}`}
                        title="Manage Questions"
                      >
                        <Edit3 size={18} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      onClick={() => openGradebook(assessment)}
                      className="ds-button-outline"
                      aria-label={`Grade ${assessment.title}`}
                    >
                      Grade
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Assessments;
