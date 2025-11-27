import React, { useState, useEffect } from 'react';
import { Plus, Search, FileText, Calendar, BookOpen, Users, ChevronRight, ArrowLeft, Save, Edit3 } from 'lucide-react';
import api from '../../utils/api';
import QuestionBuilder from '../../components/academics/QuestionBuilder';

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
  const [view, setView] = useState<'list' | 'create' | 'grade' | 'questions'>('list');
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
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Assessments
        </button>
        
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800">{currentAssessment.title}</h2>
          <p className="text-gray-500">Manage Questions</p>
        </div>

        <QuestionBuilder 
          assessmentId={currentAssessment.id} 
          onClose={() => setView('list')} 
        />
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="p-4 sm:p-6">
        <button 
          onClick={() => setView('list')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4 sm:mb-6 py-2"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Assessments
        </button>
        
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6">Create New Assessment</h2>
          
          <form onSubmit={handleCreateAssessment} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                required
                value={newAssessment.title}
                onChange={e => setNewAssessment({...newAssessment, title: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                placeholder="e.g., Mid-Term Mathematics Exam"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={newAssessment.type}
                  onChange={e => setNewAssessment({...newAssessment, type: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
                >
                  <option value="QUIZ">Quiz</option>
                  <option value="TEST">Test</option>
                  <option value="EXAM">Exam</option>
                  <option value="HOMEWORK">Homework</option>
                  <option value="PROJECT">Project</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={newAssessment.date}
                  onChange={e => setNewAssessment({...newAssessment, date: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                <select
                  required
                  value={newAssessment.classId}
                  onChange={e => setNewAssessment({...newAssessment, classId: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
                >
                  <option value="">Select</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <select
                  required
                  value={newAssessment.subjectId}
                  onChange={e => setNewAssessment({...newAssessment, subjectId: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
                >
                  <option value="">Select</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Academic Term</label>
              <select
                required
                value={newAssessment.termId}
                onChange={e => setNewAssessment({...newAssessment, termId: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
              >
                <option value="">Select Term</option>
                {terms.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Marks</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={newAssessment.totalMarks}
                  onChange={e => setNewAssessment({...newAssessment, totalMarks: Number(e.target.value)})}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weight (%)</label>
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  value={newAssessment.weight}
                  onChange={e => setNewAssessment({...newAssessment, weight: Number(e.target.value)})}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
              <textarea
                value={newAssessment.description}
                onChange={e => setNewAssessment({...newAssessment, description: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
                rows={3}
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3 sm:py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium active:scale-98"
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
      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-6">
          <button 
            onClick={() => setView('list')}
            className="flex items-center text-gray-600 hover:text-gray-900 py-2"
          >
            <ArrowLeft size={20} className="mr-2" />
            Back
          </button>
          
          <button
            onClick={saveGrades}
            disabled={savingGrades}
            className="w-full sm:w-auto flex items-center justify-center bg-blue-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 active:scale-98"
          >
            <Save size={20} className="mr-2" />
            {savingGrades ? 'Saving...' : 'Save Grades'}
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Assessment Info Header */}
          <div className="p-4 sm:p-6 border-b border-gray-200 bg-gray-50">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-800">{currentAssessment.title}</h2>
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-gray-600">
                  <span className="flex items-center"><BookOpen size={14} className="mr-1" /> {currentAssessment.subject.name}</span>
                  <span className="flex items-center"><Users size={14} className="mr-1" /> {currentAssessment.class.name}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:block sm:text-right">
                <span className="text-xs sm:text-sm text-gray-500">Total:</span>
                <span className="text-xl sm:text-2xl font-bold text-gray-800">{currentAssessment.totalMarks}</span>
              </div>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="sm:hidden divide-y divide-gray-200">
            {students.map(student => (
              <div key={student.id} className="p-4 space-y-3">
                <div>
                  <div className="font-medium text-gray-800">{student.firstName} {student.lastName}</div>
                  <div className="text-xs text-gray-500 font-mono">{student.admissionNumber}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Score</label>
                    <input
                      type="number"
                      min="0"
                      max={currentAssessment.totalMarks}
                      value={grades[student.id]?.score || ''}
                      onChange={e => handleGradeChange(student.id, 'score', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
                      placeholder="-"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Remarks</label>
                    <input
                      type="text"
                      value={grades[student.id]?.remarks || ''}
                      onChange={e => handleGradeChange(student.id, 'remarks', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600 text-sm">Student</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600 text-sm">Adm. No.</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600 text-sm w-28">Score</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600 text-sm">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {students.map(student => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 sm:px-6 py-3 font-medium text-gray-800 text-sm">
                      {student.firstName} {student.lastName}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-gray-500 font-mono text-xs">
                      {student.admissionNumber}
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      <input
                        type="number"
                        min="0"
                        max={currentAssessment.totalMarks}
                        value={grades[student.id]?.score || ''}
                        onChange={e => handleGradeChange(student.id, 'score', e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="-"
                      />
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      <input
                        type="text"
                        value={grades[student.id]?.remarks || ''}
                        onChange={e => handleGradeChange(student.id, 'remarks', e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
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
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-0">
      {/* Filters and Add Button */}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-base"
          >
            <option value="">All Classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-base"
          >
            <option value="">All Subjects</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setView('create')}
          className="w-full sm:w-auto bg-blue-600 text-white px-4 py-3 sm:py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors active:scale-98"
        >
          <Plus size={20} />
          New Assessment
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading assessments...</div>
      ) : assessments.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No assessments found</h3>
          <p className="text-gray-500 mt-1 text-sm">Create a new assessment to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {assessments.map(assessment => (
            <div key={assessment.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow active:scale-[0.99]">
              <div className="flex justify-between items-start mb-3 sm:mb-4">
                <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  assessment.type === 'EXAM' ? 'bg-red-100 text-red-700' :
                  assessment.type === 'TEST' ? 'bg-orange-100 text-orange-700' :
                  assessment.type === 'QUIZ' ? 'bg-blue-100 text-blue-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {assessment.type}
                </div>
                <span className="text-xs sm:text-sm text-gray-500">
                  {new Date(assessment.date).toLocaleDateString()}
                </span>
              </div>
              
              <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-2 line-clamp-1">{assessment.title}</h3>
              
              <div className="space-y-1.5 sm:space-y-2 mb-4 sm:mb-6">
                <div className="flex items-center text-xs sm:text-sm text-gray-600">
                  <Users size={14} className="mr-2 flex-shrink-0" />
                  <span className="truncate">{assessment.class.name}</span>
                </div>
                <div className="flex items-center text-xs sm:text-sm text-gray-600">
                  <BookOpen size={14} className="mr-2 flex-shrink-0" />
                  <span className="truncate">{assessment.subject.name}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-gray-100">
                <div className="text-xs sm:text-sm text-gray-500">
                  <span className="font-medium text-gray-900">{assessment._count?.results || 0}</span> graded
                </div>
                <div className="flex gap-1 sm:gap-2">
                  {(assessment.type === 'QUIZ' || assessment.type === 'TEST' || assessment.type === 'EXAM') && (
                    <button
                      onClick={() => openQuestionBuilder(assessment)}
                      className="flex items-center text-gray-600 hover:text-blue-600 font-medium text-sm p-2 rounded hover:bg-blue-50"
                      title="Manage Questions"
                    >
                      <Edit3 size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => openGradebook(assessment)}
                    className="flex items-center text-blue-600 hover:text-blue-700 font-medium text-xs sm:text-sm p-2 sm:p-0"
                  >
                    <span className="hidden sm:inline">Gradebook</span>
                    <span className="sm:hidden">Grade</span>
                    <ChevronRight size={16} className="ml-0.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Assessments;
