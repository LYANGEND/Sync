import React, { useState, useEffect } from 'react';
import { Plus, FileText, Calendar, BookOpen, Users, ChevronRight, ArrowLeft, Save, Edit3, Trash2 } from 'lucide-react';
import api from '../../utils/api';
import QuestionBuilder from '../../components/academics/QuestionBuilder';
import SubjectGradebook from '../../components/academics/SubjectGradebook';
import { BarChart2, TrendingUp, Award, Calculator, Download, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

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

const Assessments = () => {
  const [view, setView] = useState<'list' | 'create' | 'grade' | 'questions' | 'gradebook'>('list');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
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

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchAssessments();
  }, [selectedClass, selectedSubject]);

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
      <div className="p-6">
        <button
          onClick={() => setView('list')}
          className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Assessments
        </button>

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{currentAssessment.title}</h2>
          <p className="text-gray-500 dark:text-gray-400">Manage Questions</p>
        </div>

        <QuestionBuilder
          assessmentId={currentAssessment.id}
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
    if (!window.confirm(`Are you sure you want to delete ${selectedAssessments.size} assessments?`)) return;

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
      <div className="p-6">
        <button
          onClick={() => setView('list')}
          className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Assessments
        </button>

        <div className="max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-6">Create New Assessment</h2>

          <form onSubmit={handleCreateAssessment} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
              <input
                type="text"
                required
                value={newAssessment.title}
                onChange={e => setNewAssessment({ ...newAssessment, title: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 dark:text-white"
                placeholder="e.g., Mid-Term Mathematics Exam"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                <select
                  value={newAssessment.type}
                  onChange={e => setNewAssessment({ ...newAssessment, type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                >
                  <option value="QUIZ">Quiz</option>
                  <option value="TEST">Test</option>
                  <option value="EXAM">Exam</option>
                  <option value="HOMEWORK">Homework</option>
                  <option value="PROJECT">Project</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={newAssessment.date}
                  onChange={e => setNewAssessment({ ...newAssessment, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Class</label>
                <select
                  required
                  value={newAssessment.classId}
                  onChange={e => setNewAssessment({ ...newAssessment, classId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                >
                  <option value="">Select Class</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                <select
                  required
                  value={newAssessment.subjectId}
                  onChange={e => setNewAssessment({ ...newAssessment, subjectId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                >
                  <option value="">Select Subject</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Academic Term</label>
              <select
                required
                value={newAssessment.termId}
                onChange={e => setNewAssessment({ ...newAssessment, termId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
              >
                <option value="">Select Term</option>
                {terms.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total Marks</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={newAssessment.totalMarks}
                  onChange={e => setNewAssessment({ ...newAssessment, totalMarks: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Weight (%)</label>
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  value={newAssessment.weight}
                  onChange={e => setNewAssessment({ ...newAssessment, weight: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (Optional)</label>
              <textarea
                value={newAssessment.description}
                onChange={e => setNewAssessment({ ...newAssessment, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                rows={3}
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
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
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView('list')}
              className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <ArrowLeft size={20} className="mr-2" />
              Back to Assessments
            </button>
            <div className="h-6 w-px bg-gray-300 dark:bg-slate-600"></div>
            <button onClick={downloadTemplate} className="flex items-center text-blue-600 hover:text-blue-700 text-sm font-medium">
              <Download size={16} className="mr-1" /> Template
            </button>
            <label className="flex items-center text-blue-600 hover:text-blue-700 text-sm font-medium cursor-pointer">
              <Upload size={16} className="mr-1" /> Import
              <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>

          <button
            onClick={saveGrades}
            disabled={savingGrades}
            className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save size={20} className="mr-2" />
            {savingGrades ? 'Saving...' : 'Save Grades'}
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">{currentAssessment.title}</h2>
                <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                  <span className="flex items-center"><BookOpen size={16} className="mr-1" /> {currentAssessment.subject.name}</span>
                  <span className="flex items-center"><Users size={16} className="mr-1" /> {currentAssessment.class.name}</span>
                  <span className="flex items-center"><Calendar size={16} className="mr-1" /> {new Date(currentAssessment.date).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500 dark:text-gray-400">Total Marks</div>
                <div className="text-2xl font-bold text-gray-800 dark:text-white">{currentAssessment.totalMarks}</div>
              </div>
            </div>

            {/* Analytics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
              <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-slate-600 shadow-sm">
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase mb-1 flex items-center gap-1">
                  <BarChart2 size={14} className="text-blue-500" /> Average Score
                </div>
                <div className="text-xl font-bold text-gray-800 dark:text-white">
                  {(Object.values(grades).reduce((acc, g) => acc + (Number(g.score) || 0), 0) / (Object.keys(grades).length || 1)).toFixed(1)}
                  <span className="text-xs text-gray-400 font-normal ml-1">/ {currentAssessment.totalMarks}</span>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-slate-600 shadow-sm">
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase mb-1 flex items-center gap-1">
                  <TrendingUp size={14} className="text-green-500" /> Pass Rate
                </div>
                <div className="text-xl font-bold text-gray-800 dark:text-white">
                  {(Object.values(grades).filter(g => (Number(g.score) || 0) >= (currentAssessment.totalMarks * 0.5)).length / (Object.keys(grades).length || 1) * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-slate-600 shadow-sm">
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase mb-1 flex items-center gap-1">
                  <Award size={14} className="text-purple-500" /> Highest Score
                </div>
                <div className="text-xl font-bold text-gray-800 dark:text-white">
                  {Math.max(...Object.values(grades).map(g => Number(g.score) || 0))}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                <tr>
                  <th className="px-6 py-3 font-semibold text-gray-600 dark:text-gray-300">Student</th>
                  <th className="px-6 py-3 font-semibold text-gray-600 dark:text-gray-300">Admission No.</th>
                  <th className="px-6 py-3 font-semibold text-gray-600 dark:text-gray-300 w-32">Score</th>
                  <th className="px-6 py-3 font-semibold text-gray-600 dark:text-gray-300">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {students.map(student => (
                  <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-6 py-4 font-medium text-gray-800 dark:text-white">
                      {student.firstName} {student.lastName}
                    </td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400 font-mono text-sm">
                      {student.admissionNumber}
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        min="0"
                        max={currentAssessment.totalMarks}
                        value={grades[student.id]?.score || ''}
                        onChange={e => handleGradeChange(student.id, 'score', e.target.value)}
                        className="w-full px-3 py-1 border border-gray-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                        placeholder="-"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={grades[student.id]?.remarks || ''}
                        onChange={e => handleGradeChange(student.id, 'remarks', e.target.value)}
                        className="w-full px-3 py-1 border border-gray-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Assessments</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage exams, tests, and homework assignments.</p>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-1 gap-4 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-64">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:bg-slate-700 focus:bg-white dark:focus:bg-slate-600 dark:text-white transition-colors appearance-none cursor-pointer"
            >
              <option value="">All Classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 rotate-90" size={14} />
          </div>
          <div className="relative flex-1 sm:flex-none sm:w-64">
            <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 dark:bg-slate-700 focus:bg-white dark:focus:bg-slate-600 dark:text-white transition-colors appearance-none cursor-pointer"
            >
              <option value="">All Subjects</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 rotate-90" size={14} />
          </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          {selectedClass && selectedSubject && (
            <button
              onClick={() => setView('gradebook')}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-purple-700 transition-colors shadow-sm"
              title="View full subject matrix"
            >
              <Calculator size={18} />
              <span className="hidden sm:inline">Gradebook</span>
            </button>
          )}
          {selectedAssessments.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              className="bg-red-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-red-700 transition-colors disabled:bg-red-300 shadow-sm"
            >
              <Trash2 size={18} />
              <span className="hidden sm:inline">Delete ({selectedAssessments.size})</span>
            </button>
          )}
          <button
            onClick={() => setView('create')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-sm w-full sm:w-auto"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">New Assessment</span>
            <span className="sm:hidden">Create</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
          <p>Loading assessments...</p>
        </div>
      ) : assessments.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-gray-300 dark:border-slate-600">
          <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">No assessments found</h3>
          <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-sm mx-auto">
            {selectedClass || selectedSubject
              ? "Try adjusting your filters to find what you're looking for."
              : "Create your first assessment to start tracking student performance."}
          </p>
          {!selectedClass && !selectedSubject && (
            <button
              onClick={() => setView('create')}
              className="mt-6 text-blue-600 font-medium hover:text-blue-700"
            >
              Create New Assessment
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {assessments.map(assessment => {
            const typeColors =
              assessment.type === 'EXAM' ? { border: 'border-red-500', bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' } :
                assessment.type === 'TEST' ? { border: 'border-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' } :
                  assessment.type === 'QUIZ' ? { border: 'border-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' } :
                    { border: 'border-green-500', bg: 'bg-green-50 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' };

            return (
              <div
                key={assessment.id}
                className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 hover:shadow-md transition-all duration-200 relative group overflow-hidden border-l-4 ${typeColors.border}`}
              >
                <div className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide ${typeColors.bg} ${typeColors.text}`}>
                      {assessment.type}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 flex items-center bg-gray-50 dark:bg-slate-700 px-2 py-1 rounded">
                        <Calendar size={12} className="mr-1.5" />
                        {new Date(assessment.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedAssessments.has(assessment.id)}
                        onChange={() => toggleSelection(assessment.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 line-clamp-1 group-hover:text-blue-600 transition-colors">
                    {assessment.title}
                  </h3>

                  <div className="flex flex-col gap-1.5 mt-4">
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <BookOpen size={16} className="mr-2 text-gray-400" />
                      <span className="truncate font-medium">{assessment.subject.name}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <Users size={16} className="mr-2 text-gray-400" />
                      <span className="truncate">{assessment.class.name}</span>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-4 bg-gray-50 dark:bg-slate-700/50 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xl font-bold text-gray-800 dark:text-white leading-none">
                      {assessment._count?.results || 0}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 mt-1">Graded</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {(assessment.type === 'QUIZ' || assessment.type === 'TEST' || assessment.type === 'EXAM') && (
                      <button
                        onClick={() => openQuestionBuilder(assessment)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200"
                        title="Manage Questions"
                      >
                        <Edit3 size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => openGradebook(assessment)}
                      className="flex items-center bg-white dark:bg-slate-600 border border-gray-200 dark:border-slate-500 text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 px-3 py-1.5 rounded-lg text-sm font-medium transition-all shadow-sm group-hover:border-blue-300"
                    >
                      Grade
                      <ChevronRight size={16} className="ml-1 text-gray-400 group-hover:text-blue-500" />
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
