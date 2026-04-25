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
  PENDING:     { label: 'Not Started', color: 'text-gray-400',  bg: 'bg-gray-100 dark:bg-slate-700', ring: 'ring-gray-300',  icon: Circle },
  IN_PROGRESS: { label: 'In Progress', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', ring: 'ring-amber-400', icon: PlayCircle },
  COMPLETED:   { label: 'Completed',   color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', ring: 'ring-green-400', icon: CheckCircle },
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
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <BookOpen className="text-blue-600" />
            Lesson Planner
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Track syllabus coverage and manage lesson plans
            {selectedClass && selectedSubject && (
              <span className="ml-1">
                · <span className="font-medium text-gray-700 dark:text-gray-300">{selectedClass.name}</span>
                {' '}({gradeLabel(selectedClass.gradeLevel)})
                {' '}· <span className="font-medium text-gray-700 dark:text-gray-300">{selectedSubject.name}</span>
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
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
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
              >
                {filteredSubjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            );
          })()}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-700 mb-6">
        <button
          onClick={() => setActiveTab('SYLLABUS')}
          className={`px-6 py-3 font-medium text-sm transition-colors relative flex items-center gap-2 ${
            activeTab === 'SYLLABUS' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <BarChart3 size={16} />
          Syllabus Tracker
          {total > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              pct === 100 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : pct > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-400'
            }`}>
              {pct}%
            </span>
          )}
          {activeTab === 'SYLLABUS' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600" />}
        </button>
        <button
          onClick={() => setActiveTab('PLANS')}
          className={`px-6 py-3 font-medium text-sm transition-colors relative flex items-center gap-2 ${
            activeTab === 'PLANS' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <FileText size={16} />
          Lesson Plans
          {activeTab === 'PLANS' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600" />}
        </button>
      </div>

      {/* =============== SYLLABUS TRACKER TAB =============== */}
      {activeTab === 'SYLLABUS' ? (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <Loader2 size={20} className="animate-spin" /> Loading syllabus...
            </div>
          ) : topics.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 dark:bg-slate-800 rounded-xl border border-dashed border-gray-300 dark:border-slate-600">
              <Layers size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No topics found for this subject & grade.</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-md mx-auto">
                {selectedClass && `${selectedClass.name} is ${gradeLabel(selectedClass.gradeLevel)}.`}
                {' '}Generate a full syllabus with AI or add topics manually.
              </p>
              <div className="flex items-center justify-center gap-3 mt-4">
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 text-sm font-medium shadow-sm disabled:opacity-60 transition"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {loading ? 'Generating...' : '✨ Generate with AI'}
                </button>
                <button
                  onClick={() => setShowAddTopicModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-sm"
                >
                  <Plus size={16} /> Add manually
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ---- Progress Overview ---- */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                    <BarChart3 size={16} className="text-blue-500" />
                    Syllabus Progress
                  </h3>
                  <button
                    onClick={() => setShowAddTopicModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium"
                  >
                    <Plus size={14} /> Add Topic
                  </button>
                </div>

                {/* Progress bar */}
                <div className="relative h-3 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden mb-3">
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
                      className={`border rounded-xl overflow-hidden transition-shadow hover:shadow-sm ${
                        topic.status === 'COMPLETED'
                          ? 'border-green-200 dark:border-green-900/40 bg-green-50/30 dark:bg-green-900/10'
                          : topic.status === 'IN_PROGRESS'
                          ? 'border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-900/10'
                          : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* Status toggle */}
                        <button
                          onClick={() => handleStatusChange(topic.id, topic.status)}
                          className={`flex-shrink-0 transition-colors ${cfg.color} hover:opacity-80`}
                          title={`Click to change: ${cfg.label} → ${statusConfig[nextStatus[topic.status]].label}`}
                        >
                          <StatusIcon size={22} />
                        </button>

                        {/* Order + expand toggle */}
                        <button
                          onClick={() => subtopics.length > 0 && toggleExpand(topic.id)}
                          className="flex items-center gap-2 flex-1 text-left min-w-0"
                        >
                          <span className="text-xs font-mono text-gray-400 dark:text-gray-500 w-5 text-right">{topic.orderIndex || idx + 1}.</span>
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
                              <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 hidden sm:inline">{topic.description}</span>
                            )}
                          </div>
                        </button>

                        {/* Right side badges */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {subtopics.length > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300 font-medium">
                              {subtopics.length} sub
                            </span>
                          )}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
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
                        <div className="border-t border-gray-100 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50 divide-y divide-gray-50 dark:divide-slate-700/30">
                          {subtopics.map((st, stIdx) => {
                            const objectives = parseLearningObjectives(st.learningObjectives);
                            return (
                              <div key={st.id} className="px-6 py-2.5 flex items-start gap-3 pl-14">
                                <div className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold flex-shrink-0">
                                  {stIdx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{st.title}</span>
                                    {st.duration && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 flex items-center gap-0.5">
                                        <Clock size={9} /> {st.duration}min
                                      </span>
                                    )}
                                  </div>
                                  {st.description && (
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{st.description}</p>
                                  )}
                                  {objectives.length > 0 && (
                                    <div className="mt-1 space-y-0.5">
                                      {objectives.slice(0, 3).map((obj, i) => (
                                        <div key={i} className="flex items-start gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                                          <Target size={9} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                                          <span>{obj}</span>
                                        </div>
                                      ))}
                                      {objectives.length > 3 && (
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500 pl-4">+{objectives.length - 3} more objectives</span>
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
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Weekly Lesson Plans</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openAIModal()}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all text-sm shadow-sm"
              >
                <Sparkles size={16} />
                Generate with AI
              </button>
              <button
                onClick={() => setShowAddPlanModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Plus size={16} />
                Create Plan
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <Loader2 size={20} className="animate-spin" /> Loading plans...
            </div>
          ) : lessonPlans.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 dark:bg-slate-800 rounded-xl border border-dashed border-gray-300 dark:border-slate-600">
              <FileText size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No lesson plans found.</p>
              <button
                onClick={() => setShowAddPlanModal(true)}
                className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Create your first lesson plan
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lessonPlans.map((plan) => (
                <div key={plan.id} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2 text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full text-sm font-medium">
                      <Calendar size={16} />
                      Week of {new Date(plan.weekStartDate).toLocaleDateString()}
                    </div>
                    {plan.subject && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        <BookOpen size={12} />
                        {plan.subject.name}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{plan.title}</h3>
                  <div className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-3 prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{plan.content}</ReactMarkdown>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-slate-700">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <FileText size={16} />
                      {plan.teacher.fullName}
                      {plan.class && (
                        <span className="text-gray-400 dark:text-gray-500">· {plan.class.name}</span>
                      )}
                    </div>
                    <button className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 dark:text-white">Add New Topic</h2>
            <form onSubmit={handleAddTopic} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Topic Title</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  value={newTopic.title}
                  onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  rows={3}
                  value={newTopic.description}
                  onChange={(e) => setNewTopic({ ...newTopic, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Order Index</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  value={newTopic.orderIndex}
                  onChange={(e) => setNewTopic({ ...newTopic, orderIndex: parseInt(e.target.value) })}
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddTopicModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold mb-4 dark:text-white">Create Lesson Plan</h2>
            <form onSubmit={handleAddPlan} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Week Start Date</label>
                <input
                  type="date"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  value={newPlan.weekStartDate}
                  onChange={(e) => setNewPlan({ ...newPlan, weekStartDate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Introduction to Algebra"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  value={newPlan.title}
                  onChange={(e) => setNewPlan({ ...newPlan, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content / Objectives</label>
                <textarea
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  rows={6}
                  placeholder="Outline the lesson objectives and activities..."
                  value={newPlan.content}
                  onChange={(e) => setNewPlan({ ...newPlan, content: e.target.value })}
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddPlanModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center">
                  <Sparkles size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">AI Lesson Plan Generator</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Select a class, subject, and topic to generate
                  </p>
                </div>
              </div>
              <button onClick={() => setShowAIModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>

            {!generatedPlan ? (
              /* Configuration Step */
              <div className="p-6 space-y-5">
                {/* Class & Subject Selectors */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Class</label>
                    <select
                      value={aiClassId}
                      onChange={(e) => handleAIClassChange(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
                    >
                      <option value="">Choose a class...</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({gradeLabel(c.gradeLevel)})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                    <select
                      value={aiSubjectId}
                      onChange={(e) => handleAISubjectChange(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Topic</label>
                  {aiTopicsLoading ? (
                    <div className="flex items-center gap-2 px-4 py-2.5 text-gray-400 dark:text-gray-500 text-sm">
                      <Loader2 size={16} className="animate-spin" /> Loading topics...
                    </div>
                  ) : !aiSubjectId ? (
                    <div className="px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-500 dark:text-gray-400">
                      Select a class and subject above to see available topics.
                    </div>
                  ) : aiTopics.length === 0 ? (
                    <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-300">
                      No topics found for this subject in this class. Please add topics via the Syllabus Tracker or select a different subject.
                    </div>
                  ) : (
                    <select
                      value={aiSelectedTopicId}
                      onChange={(e) => setAISelectedTopicId(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-slate-700 dark:text-white"
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lesson Duration (minutes)</label>
                  <select
                    value={aiDuration}
                    onChange={(e) => setAIDuration(Number(e.target.value))}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-slate-700 dark:text-white"
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
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                      <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">Subtopics to include:</p>
                      <ul className="space-y-1">
                        {t.subtopics.map((st, i) => (
                          <li key={st.id} className="text-sm text-purple-600 dark:text-purple-400 flex items-center gap-2">
                            <CheckCircle size={14} /> {i + 1}. {st.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })()}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowAIModal(false)}
                    className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAIGenerate}
                    disabled={!aiSelectedTopicId || aiGenerating}
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
                        Generate Lesson Plan
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
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">Lesson plan generated successfully!</span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                  <input
                    type="text"
                    value={generatedPlan.title}
                    onChange={(e) => setGeneratedPlan({ ...generatedPlan, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lesson Plan Content</label>
                    <button
                      type="button"
                      onClick={() => setPreviewMode(!previewMode)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
                    >
                      {previewMode ? <><Edit3 size={12} /> Edit</> : <><Eye size={12} /> Preview</>}
                    </button>
                  </div>
                  {previewMode ? (
                    <div className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white text-sm max-h-[500px] overflow-y-auto prose prose-sm dark:prose-invert prose-headings:text-gray-800 dark:prose-headings:text-white prose-p:text-gray-700 dark:prose-p:text-gray-300 max-w-none">
                      <ReactMarkdown>{generatedPlan.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <textarea
                      value={generatedPlan.content}
                      onChange={(e) => setGeneratedPlan({ ...generatedPlan, content: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-purple-500 focus:border-purple-500 bg-white dark:bg-slate-700 dark:text-white font-mono text-sm"
                      rows={16}
                    />
                  )}
                </div>

                <div className="flex justify-between gap-3 pt-2">
                  <button
                    onClick={() => setGeneratedPlan(null)}
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
                      onClick={handleSaveAIPlan}
                      className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
