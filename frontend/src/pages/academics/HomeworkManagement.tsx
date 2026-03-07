import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import {
  FileText, CheckCircle, Clock, AlertTriangle,
  ChevronRight, BookOpen, Star, MessageSquare, Sparkles, X, Loader2, Plus
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Submission {
  id: string;
  assessmentId: string;
  studentId: string;
  content?: string;
  fileUrl?: string;
  status: string;
  submittedAt?: string;
  score?: number;
  feedback?: string;
  gradedAt?: string;
  isLate: boolean;
  student?: { id: string; firstName: string; lastName: string; admissionNumber: string };
  assessment?: {
    title: string;
    type: string;
    totalMarks: number;
    dueDate?: string;
    date: string;
    subject?: { name: string; code: string };
    class?: { name: string };
  };
}

interface HomeworkManagementProps {
  subjectId?: string;
}

const HomeworkManagement: React.FC<HomeworkManagementProps> = ({ subjectId: propSubjectId }) => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);

  // Teacher view
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<any>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  // Grade form
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeScore, setGradeScore] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');

  // AI Homework Generation
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiGenerating, setAIGenerating] = useState(false);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [aiSubjectId, setAISubjectId] = useState('');
  const [aiTopicName, setAITopicName] = useState('');
  const [aiHomeworkType, setAIHomeworkType] = useState<'HOMEWORK' | 'PROJECT'>('HOMEWORK');
  const [aiGeneratedContent, setAIGeneratedContent] = useState<{ title: string; content: string; totalMarks: number } | null>(null);

  useEffect(() => {
    fetchClasses();
  }, [user]);

  useEffect(() => {
    if (selectedClass) {
      fetchAssessments();
    }
  }, [selectedClass]);

  const fetchClasses = async () => {
    try {
      const [classesRes, subjectsRes, termsRes] = await Promise.all([
        api.get('/classes'),
        api.get('/subjects'),
        api.get('/academic-terms'),
      ]);
      setClasses(classesRes.data);
      setSubjects(subjectsRes.data);
      setTerms(termsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const fetchAssessments = async () => {
    try {
      const params: any = { classId: selectedClass };
      if (propSubjectId) params.subjectId = propSubjectId;
      const res = await api.get('/assessments', { params });
      // Only HOMEWORK and PROJECT types
      setAssessments(res.data.filter((a: any) => ['HOMEWORK', 'PROJECT'].includes(a.type)));
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
    }
  };

  const fetchSubmissions = async (assessmentId: string) => {
    try {
      setLoading(true);
      const res = await api.get(`/homework/${assessmentId}/submissions`);
      setSubmissions(res.data);
    } catch (error) {
      console.error('Failed to fetch submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGrade = async (submissionId: string) => {
    if (!gradeScore) {
      toast.error('Please enter a score');
      return;
    }
    try {
      await api.put(`/homework/${submissionId}/grade`, {
        score: Number(gradeScore),
        feedback: gradeFeedback,
      });
      toast.success('Graded successfully');
      setGradingId(null);
      setGradeScore('');
      setGradeFeedback('');
      if (selectedAssessment) {
        fetchSubmissions(selectedAssessment.id);
      }
    } catch (error) {
      toast.error('Failed to grade');
    }
  };

  const getStatusBadge = (status: string, isLate: boolean) => {
    const badges: Record<string, { bg: string; text: string; icon: any }> = {
      ASSIGNED: { bg: 'bg-gray-100 dark:bg-slate-700', text: 'text-gray-600 dark:text-gray-400', icon: Clock },
      SUBMITTED: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: CheckCircle },
      LATE_SUBMITTED: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', icon: AlertTriangle },
      GRADED: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', icon: Star },
      RETURNED: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', icon: MessageSquare },
    };
    const badge = badges[status] || badges.ASSIGNED;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        <Icon className="w-3 h-3" />
        {isLate && status !== 'LATE_SUBMITTED' ? 'Late' : status.replace('_', ' ')}
      </span>
    );
  };

  const handleAIGenerate = async () => {
    if (!aiSubjectId || !selectedClass) {
      toast.error('Please select a class and subject');
      return;
    }
    setAIGenerating(true);
    try {
      const selectedClassObj = classes.find((c: any) => c.id === selectedClass);
      const response = await api.post('/syllabus/generate-homework', {
        subjectId: aiSubjectId,
        topicName: aiTopicName || undefined,
        gradeLevel: selectedClassObj?.gradeLevel,
        homeworkType: aiHomeworkType,
      });
      // Parse title from AI content
      const content = response.data.content;
      const titleMatch = content.match(/\*\*Title[:\s]*\*\*\s*(.+)/i) || content.match(/^#\s*(.+)/m) || content.match(/Title[:\s]+(.+)/i);
      const title = titleMatch ? titleMatch[1].trim() : `${response.data.subjectName} ${aiHomeworkType === 'PROJECT' ? 'Project' : 'Homework'}`;
      const marksMatch = content.match(/total[:\s]*(\d+)\s*marks/i);
      const totalMarks = marksMatch ? Number(marksMatch[1]) : 50;

      setAIGeneratedContent({
        title,
        content,
        totalMarks,
      });
    } catch (error) {
      console.error('AI homework generation failed:', error);
      toast.error('Failed to generate homework. Please check your AI configuration.');
    } finally {
      setAIGenerating(false);
    }
  };

  const handleSaveAIHomework = async () => {
    if (!aiGeneratedContent || !selectedClass || !aiSubjectId) return;
    const activeTerm = terms.find((t: any) => t.isActive) || terms[0];
    if (!activeTerm) {
      toast.error('No active term found');
      return;
    }
    try {
      await api.post('/assessments', {
        title: aiGeneratedContent.title,
        type: aiHomeworkType,
        description: aiGeneratedContent.content,
        classId: selectedClass,
        subjectId: aiSubjectId,
        termId: activeTerm.id,
        totalMarks: aiGeneratedContent.totalMarks,
        weight: 5,
        date: new Date().toISOString(),
      });
      toast.success('Homework created successfully!');
      setShowAIModal(false);
      setAIGeneratedContent(null);
      setAITopicName('');
      fetchAssessments();
    } catch (error) {
      console.error('Failed to save homework:', error);
      toast.error('Failed to save homework');
    }
  };

  // ======= Teacher/Admin View =======
  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">Homework & Submissions</h2>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedAssessment(null); }}
          className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
        >
          <option value="">Select Class</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <button
          onClick={() => { setShowAIModal(true); setAIGeneratedContent(null); }}
          disabled={!selectedClass}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
        >
          <Sparkles size={16} />
          Create with AI
        </button>
      </div>

      {!selectedAssessment ? (
        /* Assessment List */
        <div className="space-y-3">
          {assessments.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{selectedClass ? 'No homework/project assessments found' : 'Select a class to view assignments'}</p>
            </div>
          ) : (
            assessments.map(a => (
              <div key={a.id}
                onClick={() => { setSelectedAssessment(a); fetchSubmissions(a.id); }}
                className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
              >
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-800 dark:text-white">{a.title}</h4>
                  <p className="text-sm text-gray-500">{a.subject?.name} • {a.type} • {Number(a.totalMarks)} marks</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{a._count?.results || 0} graded</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Submissions View */
        <div>
          <button onClick={() => setSelectedAssessment(null)} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 mb-4">
            ← Back to Assignments
          </button>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-4 mb-4">
            <h3 className="font-bold text-gray-800 dark:text-white">{selectedAssessment.title}</h3>
            <p className="text-sm text-gray-500">{selectedAssessment.subject?.name} • Total: {Number(selectedAssessment.totalMarks)} marks</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-3">
              {submissions.length === 0 ? (
                <p className="text-center py-8 text-gray-500">No submissions yet</p>
              ) : (
                submissions.map(sub => (
                  <div key={sub.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-medium text-gray-800 dark:text-white">
                          {sub.student?.firstName} {sub.student?.lastName}
                        </h4>
                        <p className="text-xs text-gray-500">{sub.student?.admissionNumber}</p>
                      </div>
                      {getStatusBadge(sub.status, sub.isLate)}
                    </div>

                    {sub.content && (
                      <div className="mt-2 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                        {sub.content}
                      </div>
                    )}

                    {sub.submittedAt && (
                      <p className="text-xs text-gray-500 mt-2">
                        Submitted: {new Date(sub.submittedAt).toLocaleString()}
                        {sub.isLate && <span className="text-red-500 ml-1">(Late)</span>}
                      </p>
                    )}

                    {/* Grade Form */}
                    {sub.status !== 'GRADED' && sub.submittedAt && (
                      gradingId === sub.id ? (
                        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-2">
                          <div className="flex gap-2">
                            <input type="number" placeholder={`Score (max ${Number(selectedAssessment.totalMarks)})`}
                              value={gradeScore} onChange={e => setGradeScore(e.target.value)}
                              max={Number(selectedAssessment.totalMarks)} min={0}
                              className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                            />
                          </div>
                          <textarea placeholder="Feedback (optional)" value={gradeFeedback}
                            onChange={e => setGradeFeedback(e.target.value)} rows={2}
                            className="w-full px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => handleGrade(sub.id)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                              Save Grade
                            </button>
                            <button onClick={() => setGradingId(null)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setGradingId(sub.id)} className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
                          Grade this submission
                        </button>
                      )
                    )}

                    {sub.status === 'GRADED' && (
                      <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <span className="font-bold text-green-700 dark:text-green-400">Score: {Number(sub.score)}/{Number(selectedAssessment.totalMarks)}</span>
                        {sub.feedback && <p className="text-sm text-gray-600 mt-1">{sub.feedback}</p>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* AI Homework Generation Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center">
                  <Sparkles size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">AI Homework Generator</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {classes.find((c: any) => c.id === selectedClass)?.name || 'Select a class first'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowAIModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>

            {!aiGeneratedContent ? (
              /* Config Step */
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                  <select
                    value={aiSubjectId}
                    onChange={e => setAISubjectId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-slate-700 dark:text-white"
                  >
                    <option value="">Choose subject...</option>
                    {(() => {
                      const cls = classes.find((c: any) => c.id === selectedClass);
                      const classSubjectIds = new Set((cls?.subjects || []).map((s: any) => s.id));
                      const filtered = classSubjectIds.size > 0
                        ? subjects.filter((s: any) => classSubjectIds.has(s.id))
                        : subjects;
                      return filtered.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ));
                    })()}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Topic (optional)</label>
                  <input
                    type="text"
                    value={aiTopicName}
                    onChange={e => setAITopicName(e.target.value)}
                    placeholder="e.g., Fractions, Photosynthesis..."
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Assignment Type</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setAIHomeworkType('HOMEWORK')}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        aiHomeworkType === 'HOMEWORK'
                          ? 'bg-purple-100 text-purple-700 border-2 border-purple-400'
                          : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                      }`}
                    >
                      📝 Homework
                    </button>
                    <button
                      onClick={() => setAIHomeworkType('PROJECT')}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        aiHomeworkType === 'PROJECT'
                          ? 'bg-purple-100 text-purple-700 border-2 border-purple-400'
                          : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                      }`}
                    >
                      🎯 Project
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowAIModal(false)}
                    className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAIGenerate}
                    disabled={!aiSubjectId || aiGenerating}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {aiGenerating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Generate Homework
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Preview Step */
              <div className="p-6 space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-600" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">Homework generated!</span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                  <input
                    type="text"
                    value={aiGeneratedContent.title}
                    onChange={e => setAIGeneratedContent({ ...aiGeneratedContent, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-purple-500 bg-white dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total Marks</label>
                    <input
                      type="number"
                      min={1}
                      value={aiGeneratedContent.totalMarks}
                      onChange={e => setAIGeneratedContent({ ...aiGeneratedContent, totalMarks: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-purple-500 bg-white dark:bg-slate-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                    <input
                      type="text"
                      value={aiHomeworkType}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content</label>
                  <textarea
                    value={aiGeneratedContent.content}
                    onChange={e => setAIGeneratedContent({ ...aiGeneratedContent, content: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-purple-500 bg-white dark:bg-slate-700 dark:text-white font-mono text-sm"
                    rows={12}
                  />
                </div>

                <div className="flex justify-between gap-3 pt-2">
                  <button
                    onClick={() => setAIGeneratedContent(null)}
                    className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg flex items-center gap-2"
                  >
                    <Sparkles size={16} />
                    Regenerate
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowAIModal(false)}
                      className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                    >
                      Discard
                    </button>
                    <button
                      onClick={handleSaveAIHomework}
                      className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Plus size={16} />
                      Create Homework
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeworkManagement;
