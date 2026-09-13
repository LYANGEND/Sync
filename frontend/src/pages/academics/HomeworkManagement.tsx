import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import {
  FileText, CheckCircle, Clock, AlertTriangle,
  ChevronRight, BookOpen, Star, MessageSquare, Sparkles, Loader2, Plus, Eye, Edit3
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/DesignSystem';
import Modal from '../../components/ui/Modal';

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
  const [aiSelectedTopicId, setAISelectedTopicId] = useState('');
  const [aiTopics, setAITopics] = useState<any[]>([]);
  const [aiLoadingTopics, setAILoadingTopics] = useState(false);
  const [aiHomeworkType, setAIHomeworkType] = useState<'HOMEWORK' | 'PROJECT'>('HOMEWORK');
  const [aiGeneratedContent, setAIGeneratedContent] = useState<{ title: string; content: string; totalMarks: number } | null>(null);
  const [previewMode, setPreviewMode] = useState(true);
  const selectedClassObj = classes.find((c: any) => c.id === selectedClass);
  const availableAISubjects = selectedClass
    ? ((selectedClassObj?.subjects?.length ? selectedClassObj.subjects : subjects) || [])
    : subjects;

  // Fetch topics when subject changes in AI modal
  useEffect(() => {
    if (!aiSubjectId || !selectedClass) {
      setAITopics([]);
      setAISelectedTopicId('');
      return;
    }
    if (!selectedClassObj?.gradeLevel && selectedClassObj?.gradeLevel !== 0) return;
    const fetchTopics = async () => {
      setAILoadingTopics(true);
      try {
        const res = await api.get(`/syllabus/topics?subjectId=${aiSubjectId}&gradeLevel=${selectedClassObj.gradeLevel}`);
        setAITopics(res.data || []);
      } catch (err) {
        console.error('Failed to fetch topics for AI modal:', err);
        setAITopics([]);
      } finally {
        setAILoadingTopics(false);
      }
    };
    fetchTopics();
  }, [aiSubjectId, selectedClass, selectedClassObj]);

  useEffect(() => {
    if (!selectedClass) {
      setAISubjectId('');
      return;
    }

    if (availableAISubjects.length === 0) {
      setAISubjectId('');
      return;
    }

    if (aiSubjectId && availableAISubjects.some((subject: any) => subject.id === aiSubjectId)) {
      return;
    }

    setAISubjectId(availableAISubjects[0].id);
  }, [selectedClass, aiSubjectId, availableAISubjects]);

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
    const badges: Record<string, { tone: string; icon: any }> = {
      ASSIGNED: { tone: 'ds-badge-neutral', icon: Clock },
      SUBMITTED: { tone: 'ds-badge-info', icon: CheckCircle },
      LATE_SUBMITTED: { tone: 'ds-badge-warning', icon: AlertTriangle },
      GRADED: { tone: 'ds-badge-success', icon: Star },
      RETURNED: { tone: 'ds-badge-info', icon: MessageSquare },
    };
    const badge = badges[status] || badges.ASSIGNED;
    const Icon = badge.icon;
    return (
      <span className={`ds-badge ${badge.tone}`}>
        <Icon className="w-3 h-3" aria-hidden="true" />
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
        topicId: aiSelectedTopicId || undefined,
        topicName: !aiSelectedTopicId && aiTopicName ? aiTopicName : undefined,
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
      setPreviewMode(true);
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
      setAISelectedTopicId('');
      fetchAssessments();
    } catch (error) {
      console.error('Failed to save homework:', error);
      toast.error('Failed to save homework');
    }
  };

  // ======= Teacher/Admin View =======
  return (
    <div className="ds-page">
      <PageHeader title="Homework & Submissions" description="Review assignments, student submissions and feedback." />

      {/* Filters */}
      <div className="ds-card ds-toolbar justify-between">
        <div className="ds-field w-full sm:w-64">
          <label htmlFor="homework-class" className="ds-label">Class</label>
          <select id="homework-class" value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedAssessment(null); }}
            className="ds-select"
          >
            <option value="">Select Class</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <button
          onClick={() => { setShowAIModal(true); setAIGeneratedContent(null); }}
          disabled={!selectedClass}
          className="ds-button-primary"
        >
          <Sparkles size={16} aria-hidden="true" />
          Create with AI
        </button>
      </div>

      {!selectedAssessment ? (
        /* Assessment List */
        <div className="space-y-3">
          {assessments.length === 0 ? (
            <div className="ds-surface ds-empty">
              <BookOpen className="w-12 h-12 mx-auto mb-3" aria-hidden="true" />
              <p>{selectedClass ? 'No homework/project assessments found' : 'Select a class to view assignments'}</p>
            </div>
          ) : (
            assessments.map(a => (
              <button key={a.id} type="button"
                aria-label={`View submissions for ${a.title}`}
                onClick={() => { setSelectedAssessment(a); fetchSubmissions(a.id); }}
                className="ds-button-outline w-full justify-start gap-4 p-4 sm:p-6 text-left"
              >
                <FileText className="w-5 h-5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold break-words">{a.title}</span>
                  <span className="ds-helper block">{a.subject?.name} • {a.type} • {Number(a.totalMarks)} marks</span>
                  <span className="ds-badge ds-badge-neutral mt-2">{a._count?.results || 0} graded</span>
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
              </button>
            ))
          )}
        </div>
      ) : (
        /* Submissions View */
        <div className="ds-section">
          <button onClick={() => setSelectedAssessment(null)} className="ds-button-ghost">
            ← Back to Assignments
          </button>

          <div className="ds-card">
            <h3>{selectedAssessment.title}</h3>
            <p className="ds-helper">{selectedAssessment.subject?.name} • Total: {Number(selectedAssessment.totalMarks)} marks</p>
          </div>

          {loading ? (
            <div role="status" className="ds-empty flex justify-center gap-3">
              <Loader2 className="animate-spin" aria-hidden="true" /> Loading submissions...
            </div>
          ) : (
            <div className="space-y-3">
              {submissions.length === 0 ? (
                <p className="ds-empty">No submissions yet</p>
              ) : (
                submissions.map(sub => (
                  <div key={sub.id} className="ds-card">
                    <div className="flex flex-wrap gap-3 items-start justify-between mb-2">
                      <div>
                        <h4>
                          {sub.student?.firstName} {sub.student?.lastName}
                        </h4>
                        <p className="text-xs text-[var(--text-secondary)]">{sub.student?.admissionNumber}</p>
                      </div>
                      {getStatusBadge(sub.status, sub.isLate)}
                    </div>

                    {sub.content && (
                      <div className="ds-surface-muted mt-2 p-4 text-sm prose prose-sm dark:prose-invert max-w-none break-words">
                        <ReactMarkdown>{sub.content}</ReactMarkdown>
                      </div>
                    )}

                    {sub.submittedAt && (
                      <p className="text-xs text-[var(--text-secondary)] mt-2">
                        Submitted: {new Date(sub.submittedAt).toLocaleString()}
                        {sub.isLate && <span className="ds-badge ds-badge-warning ml-1">Late</span>}
                      </p>
                    )}

                    {/* Grade Form */}
                    {sub.status !== 'GRADED' && sub.submittedAt && (
                      gradingId === sub.id ? (
                        <div className="ds-surface-muted mt-4 p-4 space-y-4">
                          <div className="ds-field">
                            <label htmlFor={`homework-score-${sub.id}`} className="ds-label">Score (max {Number(selectedAssessment.totalMarks)})</label>
                            <input id={`homework-score-${sub.id}`} type="number" placeholder={`Score (max ${Number(selectedAssessment.totalMarks)})`}
                              value={gradeScore} onChange={e => setGradeScore(e.target.value)}
                              max={Number(selectedAssessment.totalMarks)} min={0}
                              className="ds-input"
                            />
                          </div>
                          <div className="ds-field">
                            <label htmlFor={`homework-feedback-${sub.id}`} className="ds-label">Feedback (optional)</label>
                            <textarea id={`homework-feedback-${sub.id}`} placeholder="Feedback (optional)" value={gradeFeedback}
                              onChange={e => setGradeFeedback(e.target.value)} rows={2}
                              className="ds-textarea"
                            />
                          </div>
                          <div className="ds-form-actions">
                            <button onClick={() => handleGrade(sub.id)} className="ds-button-primary">
                              Save Grade
                            </button>
                            <button onClick={() => setGradingId(null)} className="ds-button-outline">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setGradingId(sub.id)} aria-label={`Grade this submission from ${sub.student?.firstName || ''} ${sub.student?.lastName || ''} (${sub.student?.admissionNumber || sub.id})`} className="ds-button-outline mt-3">
                          Grade this submission
                        </button>
                      )
                    )}

                    {sub.status === 'GRADED' && (
                      <div className="ds-surface-muted mt-4 p-4">
                        <span className="ds-badge ds-badge-success">Score: {Number(sub.score)}/{Number(selectedAssessment.totalMarks)}</span>
                        {sub.feedback && <p className="ds-helper mt-2">{sub.feedback}</p>}
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
        <Modal open={showAIModal} onClose={() => setShowAIModal(false)} title="AI Homework Generator"
          description={classes.find((c: any) => c.id === selectedClass)?.name || 'Select a class first'}>

            {!aiGeneratedContent ? (
              /* Config Step */
              <div className="space-y-4">
                <div>
                  <label htmlFor="homework-ai-subject" className="ds-label mb-2">Subject</label>
                  <select
                    id="homework-ai-subject"
                    value={aiSubjectId}
                    onChange={e => setAISubjectId(e.target.value)}
                    className="ds-select"
                  >
                    <option value="">Choose subject...</option>
                    {availableAISubjects.length === 0 ? (
                      <option disabled>No subjects assigned to this class</option>
                    ) : (
                      availableAISubjects.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label htmlFor={aiLoadingTopics ? undefined : 'homework-ai-topic'} className="ds-label mb-2">Topic</label>
                  {aiLoadingTopics ? (
                    <div role="status" className="ds-helper flex items-center gap-2 py-2">
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading topics...
                    </div>
                  ) : aiTopics.length > 0 ? (
                    <>
                      <select
                        id="homework-ai-topic"
                        value={aiSelectedTopicId}
                        onChange={e => { setAISelectedTopicId(e.target.value); setAITopicName(''); }}
                        className="ds-select"
                      >
                        <option value="">All topics (generate for any)</option>
                        {aiTopics.map((t: any) => (
                          <option key={t.id} value={t.id}>{t.title} ({t.subtopics?.length || 0} subtopics)</option>
                        ))}
                      </select>

                      {/* Show subtopics for selected topic */}
                      {aiSelectedTopicId && (() => {
                        const topic = aiTopics.find((t: any) => t.id === aiSelectedTopicId);
                        if (!topic?.subtopics?.length) return null;
                        return (
                          <div className="ds-surface-muted mt-2 p-4">
                            <p className="ds-label mb-2">Subtopics covered:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {topic.subtopics.map((st: any) => (
                                <span key={st.id} className="ds-badge ds-badge-neutral">
                                  {st.title}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      <input
                        id="homework-ai-topic"
                        type="text"
                        value={aiTopicName}
                        onChange={e => setAITopicName(e.target.value)}
                        placeholder={aiSubjectId ? 'No syllabus topics found — type a topic name' : 'Select a subject first'}
                        className="ds-input"
                        aria-describedby={aiSubjectId ? 'homework-ai-topic-hint' : undefined}
                      />
                      {aiSubjectId && !aiLoadingTopics && (
                        <p id="homework-ai-topic-hint" className="ds-helper mt-2">No syllabus topics found for this subject/grade. Generate a syllabus first, or type a topic manually.</p>
                      )}
                    </>
                  )}
                </div>

                <fieldset>
                  <legend className="ds-label mb-2">Assignment Type</legend>
                  <div className="ds-actions">
                    <button
                      onClick={() => setAIHomeworkType('HOMEWORK')}
                      aria-pressed={aiHomeworkType === 'HOMEWORK'}
                      className={`flex-1 ${aiHomeworkType === 'HOMEWORK' ? 'ds-button-primary' : 'ds-button-outline'}`}
                    >
                      <FileText size={16} aria-hidden="true" /> Homework
                    </button>
                    <button
                      onClick={() => setAIHomeworkType('PROJECT')}
                      aria-pressed={aiHomeworkType === 'PROJECT'}
                      className={`flex-1 ${aiHomeworkType === 'PROJECT' ? 'ds-button-primary' : 'ds-button-outline'}`}
                    >
                      <BookOpen size={16} aria-hidden="true" /> Project
                    </button>
                  </div>
                </fieldset>

                <div className="ds-form-actions">
                  <button
                    onClick={() => setShowAIModal(false)}
                    className="ds-button-outline"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAIGenerate}
                    disabled={!aiSubjectId || aiGenerating}
                    className="ds-button-primary"
                    aria-busy={aiGenerating}
                  >
                    {aiGenerating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} aria-hidden="true" />
                        Generate Homework
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Preview Step */
              <div className="space-y-4">
                <div role="status" className="ds-alert ds-badge-success">
                  <CheckCircle size={18} aria-hidden="true" />
                  <span>Homework generated!</span>
                </div>

                <div>
                  <label htmlFor="homework-ai-title" className="ds-label mb-2">Title</label>
                  <input
                    id="homework-ai-title"
                    type="text"
                    value={aiGeneratedContent.title}
                    onChange={e => setAIGeneratedContent({ ...aiGeneratedContent, title: e.target.value })}
                    className="ds-input"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="homework-ai-marks" className="ds-label mb-2">Total Marks</label>
                    <input
                      id="homework-ai-marks"
                      type="number"
                      min={1}
                      value={aiGeneratedContent.totalMarks}
                      onChange={e => setAIGeneratedContent({ ...aiGeneratedContent, totalMarks: Number(e.target.value) })}
                      className="ds-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="homework-ai-type" className="ds-label mb-2">Type</label>
                    <input
                      id="homework-ai-type"
                      type="text"
                      value={aiHomeworkType}
                      disabled
                      className="ds-input"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap gap-2 items-center justify-between mb-2">
                    <label id="homework-ai-content-label" htmlFor={previewMode ? undefined : 'homework-ai-content'} className="ds-label">Content</label>
                    <button
                      type="button"
                      onClick={() => setPreviewMode(!previewMode)}
                      className="ds-button-outline"
                      aria-label={previewMode ? 'Edit homework content' : 'Preview homework content'}
                    >
                      {previewMode ? <><Edit3 size={16} aria-hidden="true" /> Edit</> : <><Eye size={16} aria-hidden="true" /> Preview</>}
                    </button>
                  </div>
                  {previewMode ? (
                    <div role="region" aria-labelledby="homework-ai-content-label" tabIndex={0} className="ds-surface p-4 text-sm max-h-[400px] overflow-y-auto prose prose-sm dark:prose-invert max-w-none break-words">
                      <ReactMarkdown>{aiGeneratedContent.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <textarea
                      id="homework-ai-content"
                      value={aiGeneratedContent.content}
                      onChange={e => setAIGeneratedContent({ ...aiGeneratedContent, content: e.target.value })}
                      className="ds-textarea font-mono"
                      rows={12}
                    />
                  )}
                </div>

                <div className="ds-form-actions justify-between">
                  <button
                    onClick={() => setAIGeneratedContent(null)}
                    className="ds-button-outline"
                  >
                    <Sparkles size={16} aria-hidden="true" />
                    Regenerate
                  </button>
                  <div className="ds-actions">
                    <button
                      onClick={() => setShowAIModal(false)}
                      className="ds-button-outline"
                    >
                      Discard
                    </button>
                    <button
                      onClick={handleSaveAIHomework}
                      className="ds-button-primary"
                    >
                      <Plus size={16} aria-hidden="true" />
                      Create Homework
                    </button>
                  </div>
                </div>
              </div>
            )}
        </Modal>
      )}
    </div>
  );
};

export default HomeworkManagement;
