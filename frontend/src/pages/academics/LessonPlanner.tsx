import React, { useState, useEffect } from 'react';
import {
  BookOpen, CheckCircle, Circle, Plus, FileText, Calendar,
  ChevronRight, ChevronDown, Target, Clock, Layers, ListTree,
  PlayCircle, Loader2, BarChart3, ArrowUpRight, Sparkles, X, Eye, Edit3,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import syllabusService, { parseLearningObjectives } from '../../services/syllabusService';
import { PageHeader } from '../../components/ui/DesignSystem';

interface Class {
  id: string;
  name: string;
  gradeLevel: number;
  subjects?: { id: string; name: string; code: string }[];
}

interface Subject {
  id: string;
  name: string;
  code: string;
}

interface SubTopic {
  id: string;
  title: string;
  description: string | null;
  learningObjectives: string | null;
  orderIndex: number;
  duration: number | null;
}

interface Topic {
  id: string;
  title: string;
  description: string;
  gradeLevel: number;
  orderIndex: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  completedAt: string | null;
  subtopics?: SubTopic[];
  _count?: { subtopics: number };
}

interface LessonPlan {
  id: string;
  weekStartDate: string;
  title: string;
  content: string;
  fileUrl: string | null;
  teacher: {
    fullName: string;
  };
  subject?: {
    id: string;
    name: string;
    code: string;
  };
  class?: {
    id: string;
    name: string;
    gradeLevel: number;
  };
}

interface AcademicTerm {
  id: string;
  name: string;
}

function gradeLabel(gl: number): string {
  if (gl <= -1) return `ECE (Age ${gl + 6})`;
  if (gl <= 7) return `Grade ${gl}`;
  return `Form ${gl - 7}`;
}

const statusConfig = {
  PENDING:     { label: 'Not Started', badge: 'ds-badge-neutral', icon: Circle },
  IN_PROGRESS: { label: 'In Progress', badge: 'ds-badge-warning', icon: PlayCircle },
  COMPLETED:   { label: 'Completed', badge: 'ds-badge-success', icon: CheckCircle },
};

const nextStatus: Record<string, 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'> = {
  PENDING: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
  COMPLETED: 'PENDING',
};

interface LessonPlannerProps {
  subjectId?: string;
}

const LessonPlanner: React.FC<LessonPlannerProps> = ({ subjectId: propSubjectId }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'SYLLABUS' | 'PLANS'>('SYLLABUS');

  // Selection State
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  // Data State
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [currentTerm, setCurrentTerm] = useState<AcademicTerm | null>(null);

  const [loading, setLoading] = useState(false);
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [showAddTopicModal, setShowAddTopicModal] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  // Form State
  const [newPlan, setNewPlan] = useState({
    weekStartDate: new Date().toISOString().split('T')[0],
    title: '',
    content: '',
    fileUrl: ''
  });

  const [newTopic, setNewTopic] = useState({
    title: '',
    description: '',
    orderIndex: 0
  });

  // AI Generation State
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiGenerating, setAIGenerating] = useState(false);
  const [aiSelectedTopicId, setAISelectedTopicId] = useState('');
  const [aiDuration, setAIDuration] = useState(45);
  const [generatedPlan, setGeneratedPlan] = useState<{ title: string; content: string } | null>(null);
  const [previewMode, setPreviewMode] = useState(true);
  const [aiTopics, setAITopics] = useState<Topic[]>([]);
  const [aiTopicsLoading, setAITopicsLoading] = useState(false);
  // Modal-specific class/subject (independent from main page selectors)
  const [aiClassId, setAIClassId] = useState('');
  const [aiSubjectId, setAISubjectId] = useState('');
  const [aiAvailableSubjects, setAIAvailableSubjects] = useState<{ id: string; name: string; code: string; topicCount: number }[]>([]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedClassId && selectedSubjectId) {
      if (activeTab === 'SYLLABUS') {
        fetchSyllabusProgress();
      } else {
        fetchLessonPlans();
      }
    }
  }, [selectedClassId, selectedSubjectId, activeTab]);

  const fetchInitialData = async () => {
    try {
      const [classesRes, subjectsRes, termsRes] = await Promise.all([
        api.get('/classes'),
        api.get('/subjects'),
        api.get('/academic-terms')
      ]);

      setClasses(classesRes.data);
      setSubjects(subjectsRes.data);

      const activeTerm = termsRes.data.find((t: any) => t.isActive) || termsRes.data[0];
      setCurrentTerm(activeTerm);

      const firstClass = classesRes.data[0];
      if (firstClass) {
        setSelectedClassId(firstClass.id);
        if (propSubjectId) {
          setSelectedSubjectId(propSubjectId);
        } else {
          // Auto-select first subject linked to this class
          const classSubjects = firstClass.subjects || [];
          if (classSubjects.length > 0) setSelectedSubjectId(classSubjects[0].id);
        }
      } else if (propSubjectId) {
        setSelectedSubjectId(propSubjectId);
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  };

  const fetchSyllabusProgress = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/syllabus/progress?classId=${selectedClassId}&subjectId=${selectedSubjectId}`);
      setTopics(response.data);
    } catch (error) {
      console.error('Error fetching syllabus:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLessonPlans = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/syllabus/lesson-plans?classId=${selectedClassId}&subjectId=${selectedSubjectId}`);
      setLessonPlans(response.data);
    } catch (error) {
      console.error('Error fetching lesson plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (topicId: string, currentStatus: string) => {
    const newSt = nextStatus[currentStatus] || 'IN_PROGRESS';
    try {
      await api.put(`/syllabus/progress/${topicId}/${selectedClassId}`, { status: newSt });
      setTopics(prev =>
        prev.map(t =>
          t.id === topicId
            ? { ...t, status: newSt, completedAt: newSt === 'COMPLETED' ? new Date().toISOString() : null }
            : t
        )
      );
    } catch (error) {
      console.error('Error updating status:', error);
      fetchSyllabusProgress();
    }
  };

  const handleAddPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTerm) return;

    try {
      await api.post('/syllabus/lesson-plans', {
        ...newPlan,
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        termId: currentTerm.id
      });

      setShowAddPlanModal(false);
      setNewPlan({
        weekStartDate: new Date().toISOString().split('T')[0],
        title: '',
        content: '',
        fileUrl: ''
      });
      fetchLessonPlans();
    } catch (error) {
      console.error('Error adding lesson plan:', error);
    }
  };

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedClass = classes.find(c => c.id === selectedClassId);
    if (!selectedClass) return;

    try {
      await api.post('/syllabus/topics', {
        ...newTopic,
        subjectId: selectedSubjectId,
        gradeLevel: selectedClass.gradeLevel
      });

      setShowAddTopicModal(false);
      setNewTopic({ title: '', description: '', orderIndex: 0 });
      fetchSyllabusProgress();
    } catch (error) {
      console.error('Error adding topic:', error);
    }
  };

  const fetchAIAvailableSubjects = async (classId: string) => {
    try {
      const response = await api.get(`/syllabus/topic-availability?classId=${classId}`);
      const available = response.data as { id: string; name: string; code: string; topicCount: number }[];
      setAIAvailableSubjects(available);
      return available;
    } catch (error) {
      console.error('Error fetching available subjects:', error);
      setAIAvailableSubjects([]);
      return [];
    }
  };

  const fetchAITopics = async (classId?: string, subjectId?: string) => {
    const cId = classId || aiClassId;
    const sId = subjectId || aiSubjectId;
    if (!cId || !sId) return;
    setAITopicsLoading(true);
    try {
      const response = await api.get(`/syllabus/progress?classId=${cId}&subjectId=${sId}`);
      setAITopics(response.data);
    } catch (error) {
      console.error('Error fetching AI topics:', error);
    } finally {
      setAITopicsLoading(false);
    }
  };

  const openAIModal = async () => {
    setShowAIModal(true);
    setGeneratedPlan(null);
    setAISelectedTopicId('');
    setAITopics([]);

    // Initialize modal with current page selection
    const initClassId = selectedClassId;
    setAIClassId(initClassId);

    if (initClassId) {
      const available = await fetchAIAvailableSubjects(initClassId);
      // Check if current subject has topics for this class
      const currentHasTopics = available.some(s => s.id === selectedSubjectId);
      const initSubjectId = currentHasTopics ? selectedSubjectId : (available[0]?.id || '');
      setAISubjectId(initSubjectId);
      if (initSubjectId) {
        fetchAITopics(initClassId, initSubjectId);
      }
    }
  };

  const handleAIClassChange = async (classId: string) => {
    setAIClassId(classId);
    setAISubjectId('');
    setAITopics([]);
    setAISelectedTopicId('');

    const available = await fetchAIAvailableSubjects(classId);
    if (available.length > 0) {
      const firstId = available[0].id;
      setAISubjectId(firstId);
      fetchAITopics(classId, firstId);
    }
  };

  const handleAISubjectChange = (subjectId: string) => {
    setAISubjectId(subjectId);
    setAISelectedTopicId('');
    fetchAITopics(aiClassId, subjectId);
  };

  const toggleExpand = (topicId: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      next.has(topicId) ? next.delete(topicId) : next.add(topicId);
      return next;
    });
  };

  const handleAIGenerate = async () => {
    if (!aiSelectedTopicId) return;
    setAIGenerating(true);
    try {
      const selectedTopic = aiTopics.find(t => t.id === aiSelectedTopicId);
      const subTopicIds = selectedTopic?.subtopics?.map(st => st.id);
      const aiClass = classes.find(c => c.id === aiClassId);
      const response = await syllabusService.generateLessonPlan({
        topicId: aiSelectedTopicId,
        subTopicIds,
        subjectId: aiSubjectId,
        gradeLevel: aiClass?.gradeLevel,
        durationMinutes: aiDuration,
      });
      const data = response.data;
      setGeneratedPlan({
        title: `${data.subjectName} — ${data.topic.title} (${data.duration}min)`,
        content: data.lessonPlan,
      });
      setPreviewMode(true);
    } catch (error) {
      console.error('AI generation failed:', error);
      alert('Failed to generate lesson plan. Please check your AI configuration in settings.');
    } finally {
      setAIGenerating(false);
    }
  };

  const handleSaveAIPlan = async () => {
    if (!generatedPlan || !currentTerm) return;
    try {
      await api.post('/syllabus/lesson-plans', {
        weekStartDate: new Date().toISOString().split('T')[0],
        title: generatedPlan.title,
        content: generatedPlan.content,
        classId: aiClassId || selectedClassId,
        subjectId: aiSubjectId || selectedSubjectId,
        termId: currentTerm.id,
      });
      setShowAIModal(false);
      setGeneratedPlan(null);
      setAISelectedTopicId('');
      fetchLessonPlans();
    } catch (error) {
      console.error('Error saving AI plan:', error);
      alert('Failed to save lesson plan');
    }
  };

  // ---- Computed stats ----
  const completed = topics.filter(t => t.status === 'COMPLETED').length;
  const inProgress = topics.filter(t => t.status === 'IN_PROGRESS').length;
  const pending = topics.filter(t => t.status === 'PENDING').length;
  const total = topics.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const totalSubTopics = topics.reduce((s, t) => s + (t.subtopics?.length || t._count?.subtopics || 0), 0);

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);

  return (
    <div className="ds-page">
      {/* Header */}
      <PageHeader title="Lesson Planner" description={<>
            Track syllabus coverage and manage lesson plans
            {selectedClass && selectedSubject && (
              <span className="ml-1">
                · <span className="font-medium text-gray-700 dark:text-gray-300">{selectedClass.name}</span>
                {' '}({gradeLabel(selectedClass.gradeLevel)})
                {' '}· <span className="font-medium text-gray-700 dark:text-gray-300">{selectedSubject.name}</span>
              </span>
            )}
      </>} />

        <div className="ds-card ds-toolbar">
          <select
            value={selectedClassId}
            onChange={(e) => {
              const classId = e.target.value;
              setSelectedClassId(classId);
              setExpandedTopics(new Set());
              // Auto-select first subject of the new class
              if (!propSubjectId) {
                const cls = classes.find(c => c.id === classId);
                const classSubjects = cls?.subjects || [];
                setSelectedSubjectId(classSubjects.length > 0 ? classSubjects[0].id : '');
              }
            }}
            aria-label="Lesson planner class"
            className="ds-select w-full sm:w-auto"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({gradeLabel(c.gradeLevel)})</option>
            ))}
          </select>

          {!propSubjectId && (() => {
            const selectedCls = classes.find(c => c.id === selectedClassId);
            const classSubjectIds = new Set((selectedCls?.subjects || []).map(s => s.id));
            const filteredSubjects = classSubjectIds.size > 0
              ? subjects.filter(s => classSubjectIds.has(s.id))
              : subjects;
            return (
              <select
                value={selectedSubjectId}
                onChange={(e) => { setSelectedSubjectId(e.target.value); setExpandedTopics(new Set()); }}
                aria-label="Lesson planner subject"
                className="ds-select w-full sm:w-auto"
              >
                {filteredSubjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            );
          })()}
        </div>

      {/* Tabs */}
      <div className="ds-actions" role="group" aria-label="Lesson planner view">
        <button
          onClick={() => setActiveTab('SYLLABUS')}
          aria-pressed={activeTab === 'SYLLABUS'}
          className={activeTab === 'SYLLABUS' ? 'ds-button-primary' : 'ds-button-secondary'}
        >
          <BarChart3 size={16} />
          Syllabus Tracker
          {total > 0 && (
            <span className={`ds-badge ${
              pct === 100 ? 'ds-badge-success'
                : pct > 0 ? 'ds-badge-warning'
                : 'ds-badge-neutral'
            }`}>
              {pct}%
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('PLANS')}
          aria-pressed={activeTab === 'PLANS'}
          className={activeTab === 'PLANS' ? 'ds-button-primary' : 'ds-button-secondary'}
        >
          <FileText size={16} />
          Lesson Plans
        </button>
      </div>

      {/* =============== SYLLABUS TRACKER TAB =============== */}
      {activeTab === 'SYLLABUS' ? (
        <div className="space-y-4">
          {loading ? (
            <div role="status" className="ds-card flex items-center justify-center py-16 text-[var(--text-secondary)] gap-2">
              <Loader2 size={20} className="animate-spin" /> Loading syllabus...
            </div>
          ) : topics.length === 0 ? (
            <div className="ds-card ds-empty">
              <Layers size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="ds-label">No topics found for this subject & grade.</p>
              <p className="ds-helper mt-1 max-w-md mx-auto">
                {selectedClass && `${selectedClass.name} is ${gradeLabel(selectedClass.gradeLevel)}.`}
                {' '}Generate a full syllabus with AI or add topics manually.
              </p>
              <div className="ds-actions justify-center mt-4">
                <button
                  onClick={async () => {
                    if (!selectedSubjectId || !selectedClass) return;
                    setLoading(true);
                    try {
                      const res = await syllabusService.generateSyllabus({ subjectId: selectedSubjectId, gradeLevel: selectedClass.gradeLevel });
                      setTopics(res.data.topics);
                      alert(`✅ Generated ${res.data.topics.length} topics with subtopics!`);
                    } catch (err: any) {
                      alert(err?.response?.data?.message || 'Failed to generate syllabus. Is AI configured?');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="ds-button-primary"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {loading ? 'Generating...' : 'Generate with AI'}
                </button>
                <button
                  onClick={() => setShowAddTopicModal(true)}
                  className="ds-button-outline"
                >
                  <Plus size={16} /> Add manually
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ---- Progress Overview ---- */}
              <div className="ds-card">
                <div className="flex flex-wrap gap-3 items-center justify-between mb-3">
                  <h2 className="flex items-center gap-2">
                    <BarChart3 size={20} aria-hidden="true" />
                    Syllabus Progress
                  </h2>
                  <button
                    onClick={() => setShowAddTopicModal(true)}
                    className="ds-button-primary"
                  >
                    <Plus size={14} /> Add Topic
                  </button>
                </div>

                {/* Progress bar */}
                <div className="relative h-3 bg-[var(--surface-muted)] rounded-full overflow-hidden mb-3" role="img" aria-label={`Syllabus progress: ${completed} completed, ${inProgress} in progress, ${pending} not started. ${pct}% completed.`}>
                  <div
                    className="absolute left-0 top-0 h-full bg-green-500 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                  {inProgress > 0 && (
                    <div
                      className="absolute top-0 h-full bg-amber-400 rounded-full transition-all duration-500"
                      style={{ left: `${pct}%`, width: `${Math.round((inProgress / total) * 100)}%` }}
                    />
                  )}
                </div>

                {/* Stats row */}
                <div className="flex flex-wrap gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <span className="text-gray-600 dark:text-gray-400">Completed</span>
                    <span className="font-bold text-gray-900 dark:text-white">{completed}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-gray-600 dark:text-gray-400">In Progress</span>
                    <span className="font-bold text-gray-900 dark:text-white">{inProgress}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-slate-600" />
                    <span className="text-gray-600 dark:text-gray-400">Not Started</span>
                    <span className="font-bold text-gray-900 dark:text-white">{pending}</span>
                  </div>
                  <div className="ml-auto flex items-center gap-3 text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1"><Layers size={12} /> {total} topics</span>
                    <span className="flex items-center gap-1"><ListTree size={12} /> {totalSubTopics} subtopics</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{pct}%</span>
                  </div>
                </div>
              </div>

              {/* ---- Topic List with Accordion ---- */}
              <div className="space-y-2">
                {topics.map((topic, idx) => {
                  const cfg = statusConfig[topic.status];
                  const StatusIcon = cfg.icon;
                  const isExpanded = expandedTopics.has(topic.id);
                  const subtopics = topic.subtopics || [];

                  return (
                    <div
                      key={topic.id}
                      className="ds-surface overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                        {/* Status toggle */}
                        <button
                          onClick={() => handleStatusChange(topic.id, topic.status)}
                          className="ds-button-ghost shrink-0"
                          aria-label={`${topic.title}: ${cfg.label}. Change to ${statusConfig[nextStatus[topic.status]].label}`}
                          title={`Click to change: ${cfg.label} → ${statusConfig[nextStatus[topic.status]].label}`}
                        >
                          <StatusIcon size={22} aria-hidden="true" />
                        </button>

                        {/* Order + expand toggle */}
                        <button
                          onClick={() => subtopics.length > 0 && toggleExpand(topic.id)}
                          className="ds-button-ghost flex-1 justify-start text-left min-w-0 px-2"
                          aria-expanded={subtopics.length > 0 ? isExpanded : undefined}
                          aria-controls={isExpanded && subtopics.length > 0 ? `lesson-topic-${topic.id}` : undefined}
                          aria-label={subtopics.length > 0 ? `${isExpanded ? 'Collapse' : 'Expand'} ${topic.title}` : topic.title}
                        >
                          <span className="text-xs font-mono text-[var(--text-secondary)] w-5 text-right">{topic.orderIndex || idx + 1}.</span>
                          {subtopics.length > 0 && (
                            isExpanded
                              ? <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
                              : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className={`text-sm font-semibold ${
                              topic.status === 'COMPLETED'
                                ? 'text-gray-500 dark:text-gray-400 line-through'
                                : 'text-gray-900 dark:text-white'
                            }`}>
                              {topic.title}
                            </span>
                            {topic.description && (
                              <span className="text-xs text-[var(--text-secondary)] ml-2 hidden sm:inline">{topic.description}</span>
                            )}
                          </div>
                        </button>

                        {/* Right side badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          {subtopics.length > 0 && (
                            <span className="ds-badge ds-badge-info">
                              {subtopics.length} sub
                            </span>
                          )}
                          <span className={`ds-badge ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                          {topic.completedAt && (
                            <span className="text-[10px] text-green-600 dark:text-green-400 hidden md:inline">
                              {new Date(topic.completedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expanded subtopics */}
                      {isExpanded && subtopics.length > 0 && (
                        <div id={`lesson-topic-${topic.id}`} className="border-t border-[var(--border-color)] bg-[var(--surface-muted)] divide-y divide-[var(--border-color)]">
                          {subtopics.map((st, stIdx) => {
                            const objectives = parseLearningObjectives(st.learningObjectives);
                            return (
                              <div key={st.id} className="px-4 sm:px-6 py-3 flex items-start gap-3 sm:pl-14">
                                <div className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-[var(--surface)] text-[var(--text-secondary)] text-xs font-bold flex-shrink-0">
                                  {stIdx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{st.title}</span>
                                    {st.duration && (
                                      <span className="ds-badge ds-badge-neutral">
                                        <Clock size={9} /> {st.duration}min
                                      </span>
                                    )}
                                  </div>
                                  {st.description && (
                                    <p className="ds-helper mt-1">{st.description}</p>
                                  )}
                                  {objectives.length > 0 && (
                                    <div className="mt-1 space-y-0.5">
                                      {objectives.slice(0, 3).map((obj, i) => (
                                        <div key={i} className="flex items-start gap-1.5 text-xs text-[var(--text-secondary)]">
                                          <Target size={9} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                                          <span>{obj}</span>
                                        </div>
                                      ))}
                                      {objectives.length > 3 && (
                                        <span className="text-xs text-[var(--text-secondary)] pl-4">+{objectives.length - 3} more objectives</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        /* =============== LESSON PLANS TAB =============== */
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
            <h2>Weekly Lesson Plans</h2>
            <div className="ds-actions">
              <button
                onClick={() => openAIModal()}
                className="ds-button-secondary"
              >
                <Sparkles size={16} />
                Generate with AI
              </button>
              <button
                onClick={() => setShowAddPlanModal(true)}
                className="ds-button-primary"
              >
                <Plus size={16} />
                Create Plan
              </button>
            </div>
          </div>

          {loading ? (
            <div role="status" className="ds-card flex items-center justify-center py-16 text-[var(--text-secondary)] gap-2">
              <Loader2 size={20} className="animate-spin" /> Loading plans...
            </div>
          ) : lessonPlans.length === 0 ? (
            <div className="ds-card ds-empty">
              <FileText size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No lesson plans found.</p>
              <button
                onClick={() => setShowAddPlanModal(true)}
                className="ds-button-outline mt-3"
              >
                Create your first lesson plan
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lessonPlans.map((plan) => (
                <div key={plan.id} className="ds-card">
                  <div className="flex flex-wrap gap-2 justify-between items-start mb-4">
                    <div className="ds-badge ds-badge-neutral">
                      <Calendar size={16} />
                      Week of {new Date(plan.weekStartDate).toLocaleDateString()}
                    </div>
                    {plan.subject && (
                      <span className="ds-badge ds-badge-info">
                        <BookOpen size={12} />
                        {plan.subject.name}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{plan.title}</h3>
                  <div className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-3 prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{plan.content}</ReactMarkdown>
                  </div>
                  <div className="flex flex-wrap gap-3 justify-between items-center pt-4 border-t border-[var(--border-color)]">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <FileText size={16} />
                      {plan.teacher.fullName}
                      {plan.class && (
                        <span className="text-gray-400 dark:text-gray-500">· {plan.class.name}</span>
                      )}
                    </div>
                    <button className="ds-button-ghost" aria-label={`View details for ${plan.title}`}>
                      View Details <ArrowUpRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Topic Modal */}
      {showAddTopicModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <div role="dialog" aria-labelledby="lesson-add-topic-title" className="ds-card w-full max-w-md max-h-[90dvh] overflow-y-auto">
            <h2 id="lesson-add-topic-title" className="mb-4">Add New Topic</h2>
            <form onSubmit={handleAddTopic} className="space-y-4">
              <div>
                <label htmlFor="lesson-topic-title" className="ds-label mb-1">Topic Title (required)</label>
                <input
                  id="lesson-topic-title"
                  type="text"
                  required
                  className="ds-input"
                  value={newTopic.title}
                  onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="lesson-topic-description" className="ds-label mb-1">Description</label>
                <textarea
                  id="lesson-topic-description" className="ds-textarea"
                  rows={3}
                  value={newTopic.description}
                  onChange={(e) => setNewTopic({ ...newTopic, description: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="lesson-topic-order" className="ds-label mb-1">Order Index</label>
                <input
                  id="lesson-topic-order"
                  type="number"
                  className="ds-input"
                  value={newTopic.orderIndex}
                  onChange={(e) => setNewTopic({ ...newTopic, orderIndex: parseInt(e.target.value) })}
                />
              </div>
              <div className="ds-form-actions">
                <button
                  type="button"
                  onClick={() => setShowAddTopicModal(false)}
                  className="ds-button-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ds-button-primary"
                >
                  Add Topic
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Plan Modal */}
      {showAddPlanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <div role="dialog" aria-labelledby="lesson-add-plan-title" className="ds-card w-full max-w-lg max-h-[90dvh] overflow-y-auto">
            <h2 id="lesson-add-plan-title" className="mb-4">Create Lesson Plan</h2>
            <form onSubmit={handleAddPlan} className="space-y-4">
              <div>
                <label htmlFor="lesson-plan-week" className="ds-label mb-1">Week Start Date (required)</label>
                <input
                  id="lesson-plan-week"
                  type="date"
                  required
                  className="ds-input"
                  value={newPlan.weekStartDate}
                  onChange={(e) => setNewPlan({ ...newPlan, weekStartDate: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="lesson-plan-title" className="ds-label mb-1">Title (required)</label>
                <input
                  id="lesson-plan-title"
                  type="text"
                  required
                  placeholder="e.g., Introduction to Algebra"
                  className="ds-input"
                  value={newPlan.title}
                  onChange={(e) => setNewPlan({ ...newPlan, title: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="lesson-plan-content" className="ds-label mb-1">Content / Objectives (required)</label>
                <textarea
                  id="lesson-plan-content"
                  required
                  className="ds-textarea"
                  rows={6}
                  placeholder="Outline the lesson objectives and activities..."
                  value={newPlan.content}
                  onChange={(e) => setNewPlan({ ...newPlan, content: e.target.value })}
                />
              </div>
              <div className="ds-form-actions">
                <button
                  type="button"
                  onClick={() => setShowAddPlanModal(false)}
                  className="ds-button-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ds-button-primary"
                >
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Generate Lesson Plan Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <div role="dialog" aria-labelledby="lesson-ai-title" aria-describedby="lesson-ai-description" className="ds-surface w-full max-w-2xl max-h-[90dvh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="ds-avatar">
                  <Sparkles size={20} aria-hidden="true" />
                </div>
                <div>
                  <h2 id="lesson-ai-title">AI Lesson Plan Generator</h2>
                  <p id="lesson-ai-description" className="ds-helper">
                    Select a class, subject, and topic to generate
                  </p>
                </div>
              </div>
              <button onClick={() => setShowAIModal(false)} className="ds-button-ghost" aria-label="Close AI lesson plan generator">
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            {!generatedPlan ? (
              /* Configuration Step */
              <div className="p-4 sm:p-6 space-y-4">
                {/* Class & Subject Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="lesson-ai-class" className="ds-label mb-1">Class</label>
                    <select
                      id="lesson-ai-class"
                      value={aiClassId}
                      onChange={(e) => handleAIClassChange(e.target.value)}
                      className="ds-select"
                    >
                      <option value="">Choose a class...</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({gradeLabel(c.gradeLevel)})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="lesson-ai-subject" className="ds-label mb-1">Subject</label>
                    <select
                      id="lesson-ai-subject"
                      value={aiSubjectId}
                      onChange={(e) => handleAISubjectChange(e.target.value)}
                      className="ds-select"
                    >
                      <option value="">Choose a subject...</option>
                      {aiAvailableSubjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.topicCount} topics)</option>
                      ))}
                    </select>
                    {aiClassId && aiAvailableSubjects.length === 0 && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">No subjects with topics for this class. Try a different class.</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="lesson-ai-topic" id="lesson-ai-topic-label" className="ds-label mb-1">Select Topic</label>
                  {aiTopicsLoading ? (
                    <div role="status" aria-labelledby="lesson-ai-topic-label" className="flex items-center gap-2 px-4 py-2.5 ds-helper">
                      <Loader2 size={16} className="animate-spin" /> Loading topics...
                    </div>
                  ) : !aiSubjectId ? (
                    <div className="ds-alert ds-badge-neutral">
                      Select a class and subject above to see available topics.
                    </div>
                  ) : aiTopics.length === 0 ? (
                    <div className="ds-alert ds-badge-warning">
                      No topics found for this subject in this class. Please add topics via the Syllabus Tracker or select a different subject.
                    </div>
                  ) : (
                    <select
                      id="lesson-ai-topic"
                      value={aiSelectedTopicId}
                      onChange={(e) => setAISelectedTopicId(e.target.value)}
                      className="ds-select"
                    >
                      <option value="">Choose a topic...</option>
                      {aiTopics.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.orderIndex}. {t.title} {t.subtopics?.length ? `(${t.subtopics.length} subtopics)` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label htmlFor="lesson-ai-duration" className="ds-label mb-1">Lesson Duration (minutes)</label>
                  <select
                    id="lesson-ai-duration"
                    value={aiDuration}
                    onChange={(e) => setAIDuration(Number(e.target.value))}
                    className="ds-select"
                  >
                    <option value={30}>30 minutes</option>
                    <option value={40}>40 minutes</option>
                    <option value={45}>45 minutes (Standard)</option>
                    <option value={60}>60 minutes</option>
                    <option value={80}>80 minutes (Double)</option>
                  </select>
                </div>

                {aiSelectedTopicId && (() => {
                  const t = aiTopics.find(tp => tp.id === aiSelectedTopicId);
                  return t?.subtopics && t.subtopics.length > 0 ? (
                    <div className="ds-surface p-4">
                      <p className="ds-label mb-2">Subtopics to include:</p>
                      <ul className="space-y-1">
                        {t.subtopics.map((st, i) => (
                          <li key={st.id} className="ds-helper flex items-center gap-2">
                            <CheckCircle size={14} /> {i + 1}. {st.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })()}

                <div className="ds-form-actions">
                  <button
                    onClick={() => setShowAIModal(false)}
                    className="ds-button-outline"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAIGenerate}
                    disabled={!aiSelectedTopicId || aiGenerating}
                    aria-busy={aiGenerating} className="ds-button-primary"
                  >
                    {aiGenerating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Generate Lesson Plan
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Preview Step */
              <div className="p-4 sm:p-6 space-y-4">
                <div role="status" className="ds-alert ds-badge-success">
                  <CheckCircle size={18} className="text-green-600" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">Lesson plan generated successfully!</span>
                </div>

                <div>
                  <label htmlFor="lesson-ai-plan-title" className="ds-label mb-1">Title</label>
                  <input
                    id="lesson-ai-plan-title"
                    type="text"
                    value={generatedPlan.title}
                    onChange={(e) => setGeneratedPlan({ ...generatedPlan, title: e.target.value })}
                    className="ds-input"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    {previewMode ? <span className="ds-label">Lesson Plan Content</span> : <label htmlFor="lesson-ai-content" className="ds-label">Lesson Plan Content</label>}
                    <button
                      type="button"
                      onClick={() => setPreviewMode(!previewMode)}
                      aria-label={previewMode ? 'Edit lesson plan content' : 'Preview lesson plan content'}
                      className="ds-button-outline"
                    >
                      {previewMode ? <><Edit3 size={12} /> Edit</> : <><Eye size={12} /> Preview</>}
                    </button>
                  </div>
                  {previewMode ? (
                    <div id="lesson-ai-content" role="region" aria-label="Lesson plan content preview" tabIndex={0} className="ds-surface px-4 py-3 max-h-[500px] overflow-auto prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{generatedPlan.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <textarea
                      id="lesson-ai-content"
                      value={generatedPlan.content}
                      onChange={(e) => setGeneratedPlan({ ...generatedPlan, content: e.target.value })}
                      className="ds-textarea font-mono"
                      rows={16}
                    />
                  )}
                </div>

                <div className="ds-form-actions justify-between">
                  <button
                    onClick={() => setGeneratedPlan(null)}
                    className="ds-button-secondary"
                  >
                    <Sparkles size={16} />
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
                      onClick={handleSaveAIPlan}
                      className="ds-button-primary"
                    >
                      <FileText size={16} />
                      Save Lesson Plan
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

export default LessonPlanner;
